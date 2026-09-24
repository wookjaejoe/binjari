import { MINUTE, createLimiter, memo } from "@/lib/cache";
import { todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Room, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 당진도시공사 캠핑장(camping.dpto.or.kr). 해양캠핑공원·난지도 국민여가·왜목오토 세 곳이 같은
 * 사이트에 있고 `scate`(1·2·3)로 갈린다.
 *
 * - 달력(`/sub3/calendar.php`, POST year·month·scate) — 예약을 받는 날만 누를 수 있다(`noclick` 이
 *   아닌 칸). 누를 수 없는 날은 묻지 않고 없음이다.
 * - 배치도(`/sub3/reservMap{,2,3}.php`, POST year·month·day·scate) — 그 날 1박으로 사이트마다
 *   빈 것은 `siteInfoLoad(...)` 링크, 끝난 것은 `class="done"`. 둘 다 아닌 칸(관리동, 쓰지 않는
 *   사이트)은 세지 않는다. 배치도는 캠핑장마다 손으로 그린 HTML 이라 옛 구역이 주석으로 남아
 *   있다 — 주석을 먼저 지운다.
 *
 * 로그인 없이 온다(2026-09-25 실측). 배치도가 1박 기준이라 2박 이상은 모름이다.
 */

const ORIGIN = "https://camping.dpto.or.kr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_MONTHS = 3;

export const DPTO_CAMPS: { slug: string; name: string; scate: string; map: string }[] = [
  { slug: "haeyang", name: "당진 해양캠핑공원", scate: "1", map: "reservMap.php" },
  { slug: "nanjido", name: "당진 난지도 국민여가캠핑장", scate: "2", map: "reservMap2.php" },
  { slug: "waemok", name: "당진 왜목오토캠핑장", scate: "3", map: "reservMap3.php" },
];

const limit = createLimiter(2);

const campOf = (camp: CampRef) => {
  const found = DPTO_CAMPS.find((c) => c.slug === camp.slug);
  if (!found) throw new Error(`당진 캠핑장이 아닙니다: ${camp.slug}`);
  return found;
};

const squash = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ");

/** 달력 한 장 → 누를 수 있는(예약을 받는) 날. */
export function parseDptoCalendar(html: string): string[] {
  return [...squash(html).matchAll(/Mapload\('(\d{4})', '(\d{2})', '(\d{2})'/g)].map(
    ([, y, m, d]) => `${y}-${m}-${d}`,
  );
}

/** 배치도 → 사이트 이름 → 비었는가. */
export function parseDptoMap(html: string): Record<string, boolean> {
  const page = squash(html);
  const sites: Record<string, boolean> = {};
  for (const [, name] of page.matchAll(/<a onclick="siteInfoLoad\([^)]*\)"[^>]*>(?:<span>)?([^<]+)/g)) {
    sites[name.trim()] = true;
  }
  for (const [, name] of page.matchAll(/<a class="done"[^>]*>(?:<span>)?([^<]+)/g)) {
    sites[name.trim()] = false;
  }
  return sites;
}

/** "A-1" → "A", "왜목-11" → "왜목" */
const prefixOf = (site: string) => site.replace(/-?\d+$/, "");

async function post(path: string, fields: Record<string, string>, referer: string) {
  const res = await limit(() =>
    fetch(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Referer: referer },
      body: new URLSearchParams(fields),
      cache: "no-store",
    }),
  );
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.text();
}

const pageOf = (camp: CampRef) => `${ORIGIN}/sub3/3_${campOf(camp).scate}.php`;

/** 예약을 받는 날. 이번 달부터 누를 날이 없는 달에서 멈춘다. */
function openDays(camp: CampRef): Promise<string[]> {
  return memo(`portal:${camp.id}:open`, 2 * MINUTE, async () => {
    const { scate } = campOf(camp);
    const [year, m] = todayISO().split("-").map(Number);
    const days: string[] = [];
    for (let i = 0; i < MAX_MONTHS; i += 1) {
      const y = year + Math.floor((m - 1 + i) / 12);
      const mm = String(((m - 1 + i) % 12) + 1).padStart(2, "0");
      const found = parseDptoCalendar(
        await post("/sub3/calendar.php", { year: String(y), month: mm, scate }, pageOf(camp)),
      );
      days.push(...found);
      if (!found.length && i > 0) break;
    }
    return days.filter((date) => date >= todayISO()).sort();
  });
}

function mapOn(camp: CampRef, date: string): Promise<Record<string, boolean>> {
  return memo(`portal:${camp.id}:map:${date}`, 2 * MINUTE, async () => {
    const { scate, map } = campOf(camp);
    const [y, m, d] = date.split("-");
    return parseDptoMap(await post(`/sub3/${map}`, { year: y, month: m, day: d, scate }, pageOf(camp)));
  });
}

/** 구역은 배치도의 사이트 이름 머리(A-1 → A)로 나눈다. 머리가 하나뿐이면 구역도 하나다. */
async function zonesOf(camp: CampRef): Promise<{ zones: Zone[]; sites: string[] }> {
  const [first] = await openDays(camp);
  if (!first) return { zones: [], sites: [] };
  const sites = Object.keys(await mapOn(camp, first)).sort((a, b) =>
    a.localeCompare(b, "ko", { numeric: true }),
  );
  const prefixes = [...new Set(sites.map(prefixOf))];
  const zones = prefixes.map((prefix, order) => ({
    no: prefix,
    name: prefixes.length > 1 ? `${prefix}구역` : "전체",
    total: sites.filter((site) => prefixOf(site) === prefix).length,
    size: "",
    maxPeop: 0,
    order,
    photo: null,
    ground: "",
  }));
  return { zones, sites };
}

export const dpto: CampProvider = {
  id: "dpto",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return DPTO_CAMPS.map((c) => ({
      id: `${portal.id}:${c.slug}`,
      portalId: portal.id,
      slug: c.slug,
      name: c.name,
    }));
  },

  async bookingWindow(_portal, camp) {
    const days = await openDays(camp);
    if (!days.length) return null;
    return { start: days[0], end: days.at(-1)!, maxStay: null, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const { zones } = await zonesOf(camp);
    const open = nights === 1 && (await openDays(camp)).includes(date);
    const sites = open ? await mapOn(camp, date) : {};
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    for (const zone of zones) {
      counts[zone.no] = Object.entries(sites).filter(([site, free]) => free && prefixOf(site) === zone.no).length;
      amounts[zone.no] = null;
    }
    // 배치도는 1박 기준이다. 여러 박은 물을 길이 없다 — 모름이다.
    return { zones, counts, amounts, unanswered: nights > 1 } satisfies ZoneDay;
  },

  async roomDay(_portal, camp, zoneNo, date, nights) {
    if (nights > 1) return null;
    const { sites: known } = await zonesOf(camp);
    const open = (await openDays(camp)).includes(date);
    const sites = open ? await mapOn(camp, date) : {};
    const rooms: Room[] = known
      .filter((site) => prefixOf(site) === zoneNo)
      .map((site) => ({ no: `${camp.slug}:${site}`, zoneNo, name: site, amount: null, size: "" }));
    return { rooms, available: rooms.filter((room) => sites[room.name]).map((room) => room.no) };
  },

  bookingTarget(_portal, camp) {
    return { url: pageOf(camp), method: "GET", fields: {} };
  },
};
