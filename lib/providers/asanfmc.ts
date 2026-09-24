import { MINUTE, memo } from "@/lib/cache";
import { todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Room, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 아산시시설관리공단 곡교천야영장(camping.asanfmc.or.kr). 캠핑장 하나짜리다.
 *
 * "월별예약 현황"(`/main/index.php?m_cd=12&s_year=&s_mon=`) 한 장이 행 = 사이트(A1 …), 열 = 날짜
 * 표다. 칸마다 `sType one|two|three|four|five` = 예약가능·입금대기·예약완료·휴관일·공사중이고,
 * 칸 앞 주석(`<!-- 2026-10-18 < 2026-10-01 = n -->`)에 날짜가 있다. 예약을 아직 받지 않는 날은
 * 칸이 비어 있다. 로그인 없이 온다(2026-09-25 실측).
 *
 * 구역은 사이트 이름의 머리글자다(예약 스크립트가 "A지구 A1" 로 부른다). 표는 1박 기준이고
 * 여러 박 규칙을 확인하지 못해 2박 이상은 모름이다.
 */

const ORIGIN = "https://camping.asanfmc.or.kr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_MONTHS = 3;

/** 사이트 → 날짜 → 비었는가. 휴관일·공사중만 있는 날(모든 사이트가 그 상태)은 뺀다. */
export type AsanSheet = { sites: string[]; days: Record<string, Record<string, boolean>> };

export function parseAsan(html: string): AsanSheet {
  const page = html.replace(/\s+/g, " ");
  const sites = [...page.matchAll(/<div class="titTd"> ([^<]+?) <\/div>/g)].map(([, name]) => name.trim());
  const rows = [...page.matchAll(/<div class="dayGroup day\d+">(.*?)<\/div>/g)].map(([, row]) => row);
  if (!sites.length || sites.length !== rows.length) throw new Error("월별예약 현황 표를 읽지 못했습니다");

  const states: Record<string, Record<string, string>> = {};
  rows.forEach((row, index) => {
    for (const [, date, state] of row.matchAll(/<!-- [\d-]+ < (\d{4}-\d{2}-\d{2}) = \w -->.*?<span class="sType (\w+)"/g)) {
      (states[date] ??= {})[sites[index]] = state;
    }
  });

  const days: AsanSheet["days"] = {};
  for (const [date, bySite] of Object.entries(states)) {
    const values = Object.values(bySite);
    if (values.every((state) => state === "four" || state === "five")) continue;
    days[date] = Object.fromEntries(Object.entries(bySite).map(([site, state]) => [site, state === "one"]));
  }
  return { sites, days };
}

/** "A1(퍼컬러사이트)" → "A" */
const zoneOf = (site: string) => site.match(/^[A-Z]+/)?.[0] ?? "기타";

function calendar(camp: CampRef): Promise<AsanSheet> {
  return memo(`portal:${camp.id}:calendar`, 2 * MINUTE, async () => {
    const [year, m] = todayISO().split("-").map(Number);
    const all: AsanSheet = { sites: [], days: {} };
    for (let i = 0; i < MAX_MONTHS; i += 1) {
      const y = year + Math.floor((m - 1 + i) / 12);
      const mm = ((m - 1 + i) % 12) + 1;
      const url = `${ORIGIN}/main/index.php?m_cd=12&s_year=${y}&s_mon=${String(mm).padStart(2, "0")}`;
      const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      const sheet = parseAsan(await res.text());
      all.sites = [...new Set([...all.sites, ...sheet.sites])];
      Object.assign(all.days, sheet.days);
      if (!Object.keys(sheet.days).length && i > 0) break;
    }
    if (!Object.keys(all.days).length) throw new Error("예약 받는 날을 찾지 못했습니다");
    return all;
  });
}

export const asanfmc: CampProvider = {
  id: "asanfmc",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return [{ id: `${portal.id}:gokgyocheon`, portalId: portal.id, slug: "gokgyocheon", name: "아산 곡교천야영장" }];
  },

  async bookingWindow(_portal, camp) {
    const dates = Object.keys((await calendar(camp)).days).filter((date) => date >= todayISO()).sort();
    if (!dates.length) return null;
    return { start: dates[0], end: dates.at(-1)!, maxStay: null, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const { sites, days } = await calendar(camp);
    const letters = [...new Set(sites.map(zoneOf))];
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    const zones: Zone[] = letters.map((letter, order) => {
      const members = sites.filter((site) => zoneOf(site) === letter);
      counts[letter] = nights > 1 ? 0 : members.filter((site) => days[date]?.[site]).length;
      amounts[letter] = null;
      return {
        no: letter,
        name: `${letter}지구`,
        total: members.length,
        size: "",
        maxPeop: 0,
        order,
        photo: null,
        ground: "",
      };
    });
    // 표는 1박 기준이다. 여러 박 규칙을 확인하지 못했다 — 모름이다.
    return { zones, counts, amounts, unanswered: nights > 1 } satisfies ZoneDay;
  },

  async roomDay(_portal, camp, zoneNo, date, nights) {
    if (nights > 1) return null;
    const { sites, days } = await calendar(camp);
    const rooms: Room[] = sites
      .filter((site) => zoneOf(site) === zoneNo)
      .map((site) => ({ no: site, zoneNo, name: site, amount: null, size: "" }));
    return { rooms, available: rooms.filter((room) => days[date]?.[room.no]).map((room) => room.no) };
  },

  bookingTarget() {
    return { url: `${ORIGIN}/main/index.php`, method: "GET", fields: { m_cd: "12" } };
  },
};
