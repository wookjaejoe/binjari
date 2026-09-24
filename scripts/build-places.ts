/**
 * 캠핑장마다 좌표·주소·시도를 모아 lib/places.json 에 쓴다. 지도와 지역 묶음이 쓴다.
 *
 *   pnpm dev            # 캠핑장 목록을 /api/camps 에서 받는다
 *   node scripts/build-places.ts
 *
 * 좌표는 자주 바뀌지 않으니 화면이 매번 묻지 않고, 이 스크립트로 한 번 모아 커밋한다.
 * 새 캠핑장이 생기면 다시 돌린다. 이미 있는 항목은 건너뛴다(--all 이면 전부 다시).
 *
 * 출처
 * - 공공캠핑장·국립공원 야영장: 한국관광공사 고캠핑 상세 페이지. 이름으로 찾고, 상세의
 *   "예약페이지 바로가기" 링크가 우리 캠핑장(seqId=B012010, @bongsucamp)을 가리키는 것만 쓴다.
 * - 대피소: OpenStreetMap(tourism=alpine_hut). 없는 곳은 국립공원 이용안내의 주소를
 *   Nominatim 으로 찾는다(도로 단위라 덜 정확하다).
 */
import { setDefaultResultOrder } from "node:dns";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Overpass 는 IPv6 로 붙으면 시간 초과가 난다(2026-09-24). IPv4 를 먼저 쓴다.
setDefaultResultOrder("ipv4first");

type Point = { lat: number; lng: number };
type Place = Point & {
  address: string;
  sido: string;
  source: string;
  /** 대피소처럼 캠핑장 하나에 구역이 흩어진 경우 구역별 좌표 */
  zones?: Record<string, Point & { source: string }>;
};
type Camp = { id: string; name: string; portalId: string };

const OUT = new URL("../lib/places.json", import.meta.url);
const APP = process.env.APP ?? "http://localhost:3000";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
// Nominatim·Overpass 이용 정책은 도구를 알아볼 수 있는 UA 를 요구한다. 개인 정보는 싣지 않는다.
const TOOL_UA = "binjari-build-places/0.1 (+https://github.com/)";
const KNPS = "https://reservation.knps.or.kr";
const GOCAMPING = "https://www.gocamping.or.kr";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function text(url: string, init: RequestInit = {}, ua = BROWSER_UA) {
  await sleep(1100);
  const res = await fetch(url, { ...init, headers: { "User-Agent": ua, ...init.headers } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

const squash = (html: string) => html.replace(/\s+/g, " ");

/** "전북특별자치도 남원시 …" → "전북". 지역 묶음에 쓰는 짧은 이름이다. */
const SIDO: [RegExp, string][] = [
  [/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"], [/^광주/, "광주"],
  [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"], [/^경기/, "경기"], [/^강원/, "강원"],
  [/^충(청)?북/, "충북"], [/^충(청)?남/, "충남"], [/^전(라)?북|^전북/, "전북"], [/^전(라)?남/, "전남"],
  [/^경(상)?북/, "경북"], [/^경(상)?남/, "경남"], [/^제주/, "제주"],
];
const sidoOf = (address: string) => SIDO.find(([re]) => re.test(address.trim()))?.[1] ?? "";

/** 고캠핑 상세 한 장에서 좌표·주소·예약 링크를 읽는다. */
function readGocamping(html: string) {
  const page = squash(html);
  const lat = Number(page.match(/var lat = "([\d.]+)"/)?.[1]);
  const lng = Number(page.match(/var lng = "([\d.]+)"/)?.[1]);
  const address = page.match(/<dt[^>]*>주소<\/dt> <dd[^>]*>([^<]+)<\/dd>/)?.[1].trim() ?? "";
  const booking = page.match(/<a href="([^"]+)"[^>]*>예약페이지 바로가기/)?.[1] ?? "";
  // 지도 말풍선의 제목: "[전북특별자치도남원시] 학천야영장"
  const title = page.match(/<h2 class="fs-16bodyB">\[[^\]]*\]\s*([^<]+)<\/h2>/)?.[1].trim() ?? "";
  return { lat, lng, address, booking, title };
}

async function fromGocamping(
  camp: Camp,
  keywords: string[],
  matches: (url: string, title: string, address: string) => boolean,
) {
  const tried = new Set<string>();
  for (const keyword of keywords) {
    const list = await text(
      `${GOCAMPING}/bsite/camp/info/list.do?pageUnit=20&searchKrwd=${encodeURIComponent(keyword)}`,
    );
    const ids = [...new Set([...list.matchAll(/read\.do\?c_no=(\d+)/g)].map((m) => m[1]))];
    for (const id of ids.slice(0, 8)) {
      if (tried.has(id)) continue;
      tried.add(id);
      const found = readGocamping(await text(`${GOCAMPING}/bsite/camp/info/read.do?c_no=${id}`));
      if (matches(found.booking, found.title, found.address) && found.lat && found.lng) {
        return {
          lat: found.lat,
          lng: found.lng,
          address: found.address,
          sido: sidoOf(found.address),
          source: `gocamping:${id}`,
        } satisfies Place;
      }
    }
  }
  return null;
}

/**
 * 주소 → 좌표. 번지까지 넣어 못 찾으면 끝 낱말을 하나씩 떼며 다시 묻는다
 * ("… 용부원리 산13-1" → "… 용부원리"). 리·동 단위면 지도 핀으로는 충분하다.
 */
async function geocode(address: string): Promise<Point | null> {
  // 괄호 안에 옛 주소(지번)가 있으면 그것도 후보다: "전북 부안군 군막길 8 (부안군 변산면 중계리 443-1)"
  const old = address.match(/\(([^)]+)\)/)?.[1];
  const first = await geocodeOne(address);
  if (first || !old) return first;
  return geocodeOne(`${address.split(/\s+/)[0]} ${old}`);
}

async function geocodeOne(address: string): Promise<Point | null> {
  // "변산면441-11" 처럼 붙은 번지를 떼고, 괄호 속 옛 주소는 뺀다.
  const words = address
    .replace(/\(.*?\)/g, " ")
    .replace(/([가-힣])(\d)/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  for (let n = words.length; n >= 3; n -= 1) {
    const found = JSON.parse(
      await text(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=kr&limit=1&q=${encodeURIComponent(words.slice(0, n).join(" "))}`,
        {},
        TOOL_UA,
      ),
    ) as { lat: string; lon: string }[];
    if (found[0]) return { lat: Number(found[0].lat), lng: Number(found[0].lon) };
  }
  return null;
}

/** 국립공원 이용안내 페이지의 "주소" 칸. 야영장(C)·대피소(S) 모두 같은 모양이다. */
async function knpsAddress(kind: "C" | "S", deptId: string) {
  const page = squash(
    await text(
      `${KNPS}/contents/${kind}/serviceGuide.do?parkId=${deptId.slice(0, 3)}&deptId=${deptId}&prdDvcd=${kind}`,
    ),
  );
  return page.match(/주소<\/dt> <dd[^>]*>([^<]+)</)?.[1].trim() ?? "";
}

/**
 * 고캠핑에도 포털에도 주소가 없는 곳. 동 단위 주소로 찾는다. 출처를 같이 적는다.
 * - 승촌공원 캠핑장: 광주광역시 남구 승촌동(Xticket 캠핑장 이름·광주 남구 공원 안내)
 */
const ADDRESSES: Record<string, string> = {
  "xticket:seungchon": "광주광역시 남구 승촌동",
};

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

let huts: { name: string; lat: number; lng: number }[] | null = null;
async function osmHuts() {
  if (huts) return huts;
  // 나라 경계(area)로 물으면 거울 서버가 504 를 낸다. 남한을 덮는 상자로 묻는다.
  const box = "33.0,124.5,38.7,131.0";
  const query =
    `[out:json][timeout:50];(node["tourism"~"alpine_hut|wilderness_hut"](${box});` +
    `way["tourism"~"alpine_hut|wilderness_hut"](${box}););out center tags;`;
  // 주 서버가 이 망에서 연결 시간 초과를 낼 때가 있어(2026-09-24) 거울 서버를 차례로 쓴다.
  let body = "";
  for (const host of OVERPASS) {
    try {
      body = await text(`${host}?data=${encodeURIComponent(query)}`, {}, TOOL_UA);
      break;
    } catch (error) {
      console.warn(`  Overpass ${host}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (!body) throw new Error("Overpass 에 닿지 못했습니다");
  const json = JSON.parse(body) as { elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { name?: string } }[] };
  huts = json.elements.map((el) => ({
    name: (el.tags?.name ?? "").replace(/\s/g, ""),
    lat: el.lat ?? el.center!.lat,
    lng: el.lon ?? el.center!.lon,
  }));
  return huts;
}

async function shelterPlace(camp: Camp): Promise<Place | null> {
  const deptId = camp.id.split(":")[1];
  const park = camp.name.replace(/ 대피소$/, "");
  const grid = squash(
    await text(`${KNPS}/reservation/shelter/tabShelter.do`, {
      method: "POST",
      body: new URLSearchParams({ deptId, deptNm: park, isGreenpoint: "N" }),
    }),
  );
  // 대피소 이름 → 그 대피소의 부서 번호(이용안내 주소를 찾을 때 쓴다)
  const depts = new Map<string, string>();
  for (const [, name, dept] of grid.matchAll(/data-fclt-nm="([^"]+)" data-dept-id="([A-Z0-9]+)"/g)) {
    if (!depts.has(name)) depts.set(name, dept);
  }
  const side = grid.slice(grid.indexOf('class="table-sticky-body"'));
  const names = [...side.slice(0, side.indexOf("</table>")).matchAll(/class="tbl_point">([^<]+)</g)].map(
    (m) => m[1].trim(),
  );

  const zones: NonNullable<Place["zones"]> = {};
  let firstAddress = "";
  for (const name of names) {
    const core = name.replace(/대피소$/, "").replace(/^제\d/, "");
    const hut = (await osmHuts()).find((h) => h.name.includes(core));
    const dept = depts.get(name);
    const address = dept ? await knpsAddress("S", dept) : "";
    firstAddress ||= address;
    if (hut) {
      zones[name] = { lat: hut.lat, lng: hut.lng, source: "osm" };
      continue;
    }
    const point = address ? await geocode(address) : null;
    if (point) zones[name] = { ...point, source: "nominatim" };
    else console.warn(`  좌표 없음: ${name} (${address || "주소 없음"})`);
  }
  const points = Object.values(zones);
  if (!points.length) return null;
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
    address: firstAddress,
    sido: sidoOf(firstAddress),
    source: "centroid",
    zones,
  };
}

async function campPlace(camp: Camp): Promise<Place | null> {
  const [portal, slug] = camp.id.split(":");
  if (portal === "knps-shelter") return shelterPlace(camp);

  if (portal === "knps") {
    const core = camp.name.split(" ").slice(1).join(" ").replace(/\d+$/, "");
    // 고캠핑의 국립공원 야영장은 예약 링크가 대개 국립공원 첫 화면이다(seqId 없음). 링크가
    // 국립공원이고 이름에 야영장 이름이 들어 있으면 같은 곳으로 본다.
    const hit = await fromGocamping(
      camp,
      [core, `${core}야영장`],
      (url, title) => url.includes(slug) || (url.includes("knps.or.kr") && title.includes(core)),
    );
    if (hit) return hit;
    const address = await knpsAddress("C", slug);
    const point = address ? await geocode(address) : null;
    return point ? { ...point, address, sido: sidoOf(address), source: "nominatim" } : null;
  }

  if (ADDRESSES[camp.id]) {
    const address = ADDRESSES[camp.id];
    const point = await geocode(address);
    return point ? { ...point, address, sido: sidoOf(address), source: "nominatim" } : null;
  }

  if (portal === "xticket") {
    // 고캠핑의 예약 링크가 Xticket 을 가리키는 같은 이름의 캠핑장.
    const core = camp.name.replace(/(가족|오토)?캠핑장$/, "").replace(/ 캠핑장$/, "").trim();
    return fromGocamping(
      camp,
      [camp.name, core, core.slice(0, 2)],
      (url, title) => url.includes("xticket.kr") || title.replace(/\s/g, "").includes(core.replace(/\s/g, "")),
    );
  }

  if (portal === "gwgs") {
    const core = camp.name.replace(/(오토)?캠핑장$/, "").trim();
    const hit = await fromGocamping(
      camp,
      [camp.name, core],
      (url, title, address) =>
        url.includes(`@${slug}`) || (title.includes(core) && address.includes("고성군")),
    );
    if (hit) return hit;
    // 고캠핑에 없으면 포털 캠핑장 첫 화면의 "지역" 칸 주소로 찾는다.
    const page = squash(await text(`https://gwgs.pubcamping.kr/@${slug}/index`));
    const address = page.match(/지역\s*(?:<[^>]+>\s*)*([^<]+?)\s*(?:<[^>]+>\s*)*지도보기/)?.[1].trim() ?? "";
    const point = address ? await geocode(address) : null;
    return point ? { ...point, address, sido: sidoOf(address), source: "nominatim" } : null;
  }

  // 그 밖의 포털: 이름이 "세종 전월산캠핑장"처럼 지역 + 캠핑장 이름이면, 고캠핑 제목에 캠핑장
  // 이름이 들어 있고 주소에 그 지역이 들어 있는 것.
  const [hint, ...rest] = camp.name.split(" ");
  if (rest.length) {
    const core = rest.join(" ").replace(/(국민여가)?캠핑장$/, "").trim();
    return fromGocamping(camp, [core, `${hint} ${core}`], (_url, title, address) =>
      title.includes(core) && address.includes(hint),
    );
  }
  return null;
}

async function main() {
  const all = process.argv.includes("--all");
  const places: Record<string, Place> =
    !all && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const { camps } = (await (await fetch(`${APP}/api/camps`)).json()) as { camps: Camp[] };

  for (const camp of camps) {
    if (places[camp.id]) continue;
    process.stdout.write(`${camp.id} ${camp.name} … `);
    try {
      const place = await campPlace(camp);
      if (place) {
        places[camp.id] = place;
        console.log(`${place.sido} ${place.lat.toFixed(4)},${place.lng.toFixed(4)} (${place.source})`);
      } else {
        console.log("못 찾음");
      }
    } catch (error) {
      console.log(`실패: ${error instanceof Error ? error.message : error}`);
    }
    // 중간에 끊겨도 모은 만큼은 남긴다.
    writeFileSync(OUT, JSON.stringify(sortKeys(places), null, 2) + "\n");
  }
}

const sortKeys = <T,>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

await main();
