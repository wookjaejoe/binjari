import { HOUR, MINUTE, memo } from "@/lib/cache";
import { compactToISO, shiftISO } from "@/lib/date";
import type {
  BookingWindow,
  CampProvider,
  CampRef,
  Portal,
  Room,
  RoomDay,
  Zone,
  ZoneDay,
} from "@/lib/providers/types";

/**
 * 국립공원공단 예약시스템(reservation.knps.or.kr)의 야영장.
 *
 * pubcamping 과 모양이 반대다. pubcamping 은 날짜마다 한 번씩 물어 구역 잔여를 받지만,
 * 여기는 야영장 하나를 물으면 영지 × 예약 기간 전체의 표가 한 번에 온다(HTML, 5MB 안팎).
 * 그래서 표를 한 번 받아 캐시에 두고 zoneDay·roomDay 가 그 표에서 읽는다.
 *
 * 구역은 표의 시설 묶음(자동차야영장·카라반·특화야영장…), 객실은 영지 한 칸(B01…)이다.
 * 표에는 사진이 없다. 구역 사진은 이용안내 페이지의 사진첩에서 따로 받는다.
 */

const ORIGIN = "https://reservation.knps.or.kr";
const BOOKING_PAGE = `${ORIGIN}/reservation/searchSimpleCampReservation.do`;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/**
 * 포털이 고를 수 있게 하는 숙박일수는 1박·2박뿐이다. 날짜를 누르면 `1박 2일`을 띄우고,
 * 다음 날 칸도 예약가능일 때만 `2박 3일`을 더한다(campsite.js). 3박 이상은 고를 길이 없다.
 */
const MAX_NIGHTS = 2;

/** 스캔 캐시(3분)보다 짧게 둔다. 자동 갱신이 돌 때마다 새 표를 받는다. */
const GRID_TTL = 2 * MINUTE;

/** 영지 한 칸. 예약가능만 open 이다. 대기가능·예약만료·예약불가는 전부 빈자리가 아니다. */
type Night = { open: boolean; amount: number | null };

type Site = { no: string; name: string; zone: string; nights: Record<string, Night> };

export type Grid = { dates: string[]; zones: string[]; sites: Site[] };

async function fetchText(url: string, body?: Record<string, string>) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      "User-Agent": UA,
      ...(body && { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }),
    },
    body: body && new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

const between = (html: string, start: string, end?: string) => {
  const from = html.indexOf(start);
  if (from < 0) return null;
  const to = end ? html.indexOf(end, from) : -1;
  return html.slice(from, to < 0 ? undefined : to);
};

const rowsOf = (table: string) => [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);

/** `<span class="title"> B01 </span>`, 툴팁이 붙으면 `<span class="title tooltip"> 하우스-9 <span …>`. */
const titleOf = (cell: string) => cell.match(/<span class="title[^"]*">([^<]*)/)?.[1].trim() ?? "";

/**
 * 영지 표를 읽는다. 왼쪽 고정 열(table-sticky-body)에 시설 묶음과 영지 이름이, 오른쪽
 * 본문(table-body)에 같은 순서로 날짜 칸이 있다. 칸마다 `class="icon-… 20260925_N"` 꼴로
 * 상태와 날짜가, 예약가능 칸에는 `data-sal-amt` 로 그 날 요금이 붙는다.
 */
export function parseGrid(html: string): Grid {
  // 오른쪽 본문에는 숨긴 thead 가 있다. tbody 부터 읽어야 행 순서가 왼쪽과 맞는다.
  const side = between(html, 'class="table-sticky-body"', "</table>");
  const body = between(between(html, 'class="table-body"', "</table>") ?? "", "<tbody");
  if (!side || !body) throw new Error("영지 표를 찾지 못했습니다");

  const labels: { zone: string; name: string }[] = [];
  let zone = "";
  for (const row of rowsOf(side)) {
    const group = row.match(/<th[^>]*rowspan="\d+"[^>]*>([\s\S]*?)<\/th>/);
    if (group) zone = titleOf(group[1]);
    const cells = [...row.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)];
    labels.push({ zone, name: titleOf(cells.at(-1)?.[1] ?? "") });
  }

  const dates = new Set<string>();
  const sites: Site[] = rowsOf(body).map((row, index) => {
    const { zone, name } = labels[index] ?? { zone: "", name: "" };
    const nights: Record<string, Night> = {};
    for (const [tag] of row.matchAll(/<i [^>]*class="icon-[^"]*"[^>]*>/g)) {
      const found = tag.match(/class="(icon-[a-z-]+) (\d{8})_[A-Z]"/);
      if (!found) continue;
      const date = compactToISO(found[2]);
      const amount = tag.match(/data-sal-amt='(\d+)'/)?.[1];
      dates.add(date);
      nights[date] = {
        open: found[1] === "icon-reservation",
        amount: amount ? Number(amount) : null,
      };
    }
    return { no: `${zone}:${name}`, name, zone, nights };
  });

  if (!sites.length || !dates.size) throw new Error("영지 표가 비어 있습니다");

  return {
    dates: [...dates].sort(),
    zones: [...new Set(sites.map((site) => site.zone))],
    sites,
  };
}

/** 체크인 날짜부터 연달아 예약가능인가. 요금은 박마다 더한다 — 포털도 1박 요금 + 다음 날 요금이다. */
function stay(site: Site, date: string, nights: number): { open: boolean; amount: number } {
  // 3박 이상은 포털에 고를 길이 없다. 물으면 0 을 주는 pubcamping 과 같게 없음이다.
  if (nights > MAX_NIGHTS) return { open: false, amount: 0 };
  let amount = 0;
  for (let i = 0; i < nights; i += 1) {
    const night = site.nights[shiftISO(date, i)];
    if (!night?.open) return { open: false, amount: 0 };
    amount += night.amount ?? 0;
  }
  return { open: true, amount };
}

/** 구역(시설 묶음)마다 그 일정으로 예약가능한 영지 수와 그중 가장 싼 요금. */
export function zoneDayOf(grid: Grid, date: string, nights: number): ZoneDay {
  const counts: Record<string, number> = {};
  const amounts: Record<string, number | null> = {};

  const zones: Zone[] = grid.zones.map((name, order) => {
    const members = grid.sites.filter((site) => site.zone === name);
    const open = members.map((site) => stay(site, date, nights)).filter((s) => s.open);
    counts[name] = open.length;
    amounts[name] = open.length ? Math.min(...open.map((s) => s.amount)) : null;
    return {
      no: name,
      name,
      total: members.length,
      size: "",
      maxPeop: 0,
      order,
      photo: null,
      ground: "",
    };
  });

  return { zones, counts, amounts };
}

export function roomDayOf(grid: Grid, zoneNo: string, date: string, nights: number): RoomDay {
  const rooms: Room[] = [];
  const available: string[] = [];
  for (const site of grid.sites) {
    if (site.zone !== zoneNo) continue;
    const result = stay(site, date, nights);
    // 목록에 적는 요금은 그 날 요금이다. 그 날 칸에 요금이 없으면(예약 끝난 칸) 표에서 처음
    // 보이는 요금을 쓴다 — 둘 다 포털이 준 값이다.
    const first = Object.values(site.nights).find((night) => night.amount != null);
    rooms.push({
      no: site.no,
      zoneNo,
      name: site.name,
      amount: result.open ? result.amount : (site.nights[date]?.amount ?? first?.amount ?? null),
      size: "",
    });
    if (result.open) available.push(site.no);
  }
  return { rooms, available };
}

export type Photo = { title: string; src: string };

/**
 * 이용안내 > 야영장 페이지의 사진첩. 사진마다 `alt` 에 시설 이름이 붙어 있다
 * (`카라반(4인)`, `카라반(4인)_내부1`, `야영장 입구`, `배치도`). 같은 사진첩이 두 번(큰 것·작은 것)
 * 들어 있어 주소로 거른다.
 */
export function parsePhotos(html: string): Photo[] {
  const seen = new Set<string>();
  const photos: Photo[] = [];
  for (const [, src, title] of html.matchAll(
    /<div class="swiper-slide"[^>]*>\s*<img src="([^"]+)" alt="([^"]*)"/g,
  )) {
    if (seen.has(src)) continue;
    seen.add(src);
    photos.push({ title: title.trim(), src: new URL(src, ORIGIN).href });
  }
  return photos;
}

/**
 * 구역의 표지 사진. 시설 이름이 구역 이름으로 시작하는 첫 사진(카라반 → `카라반(4인)`)이고,
 * `_내부1` 같은 딸린 사진은 건너뛴다. 맞는 게 없으면(예: `특화야영장` 인데 사진은 `하우스형…`)
 * 그 야영장의 첫 사진을 쓴다. 배치도는 지도라 표지로 쓰지 않는다.
 */
export function photoFor(photos: Photo[], zone: string): string | null {
  const covers = photos.filter(
    (photo) => !photo.title.includes("_") && !photo.title.includes("배치도"),
  );
  return (covers.find((photo) => photo.title.startsWith(zone)) ?? covers[0])?.src ?? null;
}

function photos(camp: CampRef): Promise<Photo[]> {
  return memo(`knps:photos:${camp.slug}`, 12 * HOUR, async () =>
    parsePhotos(
      await fetchText(
        `${ORIGIN}/contents/C/serviceGuide.do?parkId=${camp.slug.slice(0, 3)}` +
          `&deptId=${camp.slug}&prdDvcd=C`,
      ),
    ),
  );
}

function grid(camp: CampRef): Promise<Grid> {
  // 키가 `portal:<campId>` 로 시작하면 새로고침(dropScanCache)이 같이 지운다.
  return memo(`portal:${camp.id}:grid`, GRID_TTL, async () =>
    parseGrid(
      await fetchText(`${ORIGIN}/reservation/campsiteList.do`, {
        dept_id: camp.slug,
        prd_ctg_id: "",
        isGreenpoint: "N",
      }),
    ),
  );
}

export const knps: CampProvider = {
  id: "knps",
  // 기간을 알려면 5MB 표를 받아야 한다. 캠핑장 목록(48곳)을 열 때마다 받을 수는 없으니
  // 캠핑장을 켰을 때 스캔과 함께 받는다.
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return memo(`knps:camps`, 12 * HOUR, async () => {
      const html = await fetchText(BOOKING_PAGE);
      const camps: CampRef[] = [];
      const seen = new Set<string>();
      // 공원 → 야영장 메뉴. goCampProductDetail('지리산','달궁1','B012005', '')
      for (const [, park, name, deptId] of html.matchAll(
        /goCampProductDetail\('([^']+)','([^']+)','([A-Z0-9]+)'/g,
      )) {
        if (seen.has(deptId)) continue;
        seen.add(deptId);
        camps.push({
          id: `${portal.id}:${deptId}`,
          portalId: portal.id,
          slug: deptId,
          name: `${park} ${name.trim()}`,
        });
      }
      if (!camps.length) throw new Error("국립공원 야영장 목록을 찾지 못했습니다");
      return camps;
    });
  },

  async bookingWindow(_portal, camp) {
    const { dates } = await grid(camp);
    return {
      start: dates[0],
      end: dates.at(-1)!,
      maxStay: MAX_NIGHTS,
      minStay: null,
    } satisfies BookingWindow;
  },

  async zoneDay(_portal, camp, date, nights) {
    const day = zoneDayOf(await grid(camp), date, nights);
    // 사진을 못 받아도 빈자리 조회는 그대로다. 사진 없음으로 그린다.
    const gallery = await photos(camp).catch(() => []);
    return {
      ...day,
      zones: day.zones.map((zone) => ({ ...zone, photo: photoFor(gallery, zone.name) })),
    };
  },

  async roomDay(_portal, camp, zoneNo, date, nights) {
    return roomDayOf(await grid(camp), zoneNo, date, nights);
  },

  /**
   * 포털은 야영장을 URL 로 고를 수 없다(메뉴를 눌러 스크립트로 연다). 예약 페이지 첫 화면까지만
   * 보내고, 거기서 공원 → 야영장 → 날짜를 누른다.
   */
  bookingTarget() {
    return { url: BOOKING_PAGE, method: "GET", fields: {} };
  },
};
