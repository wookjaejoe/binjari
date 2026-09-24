import { MINUTE, createLimiter, memo } from "@/lib/cache";
import { shiftISO, todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Room, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 부산 영도 마리노오토캠핑장(www.yeongdo.go.kr/marinocamping). 캠핑장 하나짜리다.
 *
 * "잔여사이트 선착순 예약" 화면이 부르는 조각 두 가지로 끝난다(2026-09-25 실측, 로그인 없음).
 * - 달력(`/camp/apply/calendar.do?yyyy=&mm=&appGubun=COMMON`) — 예약을 받는 날은 `able-apply`.
 * - 사이트 목록(`/camp/apply/site/list.do?siteGubun=&appSdate=&campNight=`) — 구역(G01 카라반·
 *   G02 오토사이트·G03 일반사이트)의 사이트마다 `siteCode`(예약가능)·`unselect`(예약불가).
 * 여러 박은 포털이 직접 답한다(`campNight` 1–3). 사이트 목록은 날짜 × 구역마다 한 번씩 묻는다.
 */

const BASE = "https://www.yeongdo.go.kr/marinocamping";
const PAGE = `${BASE}/00003/00015/00028.web`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_NIGHTS = 3;
const MAX_MONTHS = 3;

const ZONES = [
  { no: "G01", name: "카라반", unit: "대" },
  { no: "G02", name: "오토사이트", unit: undefined },
  { no: "G03", name: "일반사이트", unit: undefined },
] as const;

const limit = createLimiter(2);

async function get(path: string) {
  const res = await limit(() =>
    fetch(`${BASE}${path}`, {
      headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", Referer: PAGE },
      cache: "no-store",
    }),
  );
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.text()).replace(/\s+/g, " ");
}

/** 달력 조각 → 예약을 받는 날. */
export function parseYeongdoCalendar(html: string): string[] {
  return [...html.matchAll(/<td class="able-apply[^"]*"[^>]*data-date-string="(\d{4}-\d{2}-\d{2})"/g)].map(
    ([, date]) => date,
  );
}

/** 사이트 목록 조각 → 사이트 이름 → 예약할 수 있는가. */
export function parseYeongdoSites(html: string): Record<string, boolean> {
  const sites: Record<string, boolean> = {};
  const pattern = /<li class="(siteCode|unselect)[^"]*"[^>]*>\s*<button[^>]*>\s*([^<]+?)\s*<\/button>/g;
  for (const [, state, name] of html.matchAll(pattern)) sites[name] = state === "siteCode";
  return sites;
}

function openDays(): Promise<Set<string>> {
  return memo("portal:yeongdo:open", 2 * MINUTE, async () => {
    const [year, m] = todayISO().split("-").map(Number);
    const days = new Set<string>();
    for (let i = 0; i < MAX_MONTHS; i += 1) {
      const y = year + Math.floor((m - 1 + i) / 12);
      const mm = String(((m - 1 + i) % 12) + 1).padStart(2, "0");
      const found = parseYeongdoCalendar(await get(`/camp/apply/calendar.do?yyyy=${y}&mm=${mm}&appGubun=COMMON`));
      for (const date of found) if (date >= todayISO()) days.add(date);
      if (!found.length && i > 0) break;
    }
    return days;
  });
}

/** 그 일정의 구역 사이트. 밤 하나라도 예약을 받지 않는 날이면 화면이 고르지 못하게 한다 — 묻지 않는다. */
async function sitesFor(zone: string, date: string, nights: number): Promise<Record<string, boolean> | null> {
  if (nights > MAX_NIGHTS) return null;
  const open = await openDays();
  for (let i = 0; i < nights; i += 1) if (!open.has(shiftISO(date, i))) return null;
  return memo(`portal:yeongdo:sites:${zone}:${date}:${nights}`, 2 * MINUTE, async () =>
    parseYeongdoSites(
      await get(
        `/camp/apply/site/list.do?siteGubun=${zone}&appSdate=${date}&campNight=${nights}&appGubun=COMMON&appSno=0`,
      ),
    ),
  );
}

/** 구역의 사이트 전부. 예약을 받는 첫 날의 1박 목록에서 읽는다. */
async function catalog(zone: string): Promise<string[]> {
  const [first] = [...(await openDays())].sort();
  if (!first) return [];
  return Object.keys((await sitesFor(zone, first, 1)) ?? {});
}

export const yeongdo: CampProvider = {
  id: "yeongdo",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return [{ id: `${portal.id}:marino`, portalId: portal.id, slug: "marino", name: "부산 영도 마리노오토캠핑장" }];
  },

  async bookingWindow() {
    const days = [...(await openDays())].sort();
    if (!days.length) return null;
    return { start: days[0], end: days.at(-1)!, maxStay: MAX_NIGHTS, minStay: null };
  },

  async zoneDay(_portal, _camp: CampRef, date, nights) {
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    const zones: Zone[] = [];
    for (const [order, zone] of ZONES.entries()) {
      const sites = await sitesFor(zone.no, date, nights);
      counts[zone.no] = Object.values(sites ?? {}).filter(Boolean).length;
      amounts[zone.no] = null;
      zones.push({
        no: zone.no,
        name: zone.name,
        total: (await catalog(zone.no)).length,
        unit: zone.unit,
        size: "",
        maxPeop: 0,
        order,
        photo: null,
        ground: "",
      });
    }
    return { zones, counts, amounts } satisfies ZoneDay;
  },

  async roomDay(_portal, _camp, zoneNo, date, nights) {
    const sites = (await sitesFor(zoneNo, date, nights)) ?? {};
    const rooms: Room[] = (await catalog(zoneNo)).map((name) => ({
      no: `${zoneNo}:${name}`,
      zoneNo,
      name,
      amount: null,
      size: "",
    }));
    return { rooms, available: rooms.filter((room) => sites[room.name]).map((room) => room.no) };
  },

  bookingTarget() {
    return { url: PAGE, method: "GET", fields: {} };
  },
};
