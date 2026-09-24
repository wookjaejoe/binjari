import { MINUTE, memo } from "@/lib/cache";
import { todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 예산 예당관광지 국민여가캠핑장(camping.yesan.go.kr). 캠핑장 하나짜리 포털이다.
 *
 * 달력 조각(getCalendar.do?year=&month=)이 로그인 없이 온다. 예약을 받는 날은
 * `<td class="possible" data-search-bgng-dt="2026-10-01">` 이고, 그 안에 구역(A·B)마다
 * `3개 예약가능` 또는 `0개 예약마감` 이 있다. 칸은 1박 기준이라 2박 이상은 모름이다.
 */

const ORIGIN = "https://camping.yesan.go.kr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

type Month = Record<string, Record<string, number>>;

/** 달력 조각 → 날짜 → 구역(A구역…) → 남은 수. 예약을 받지 않는 날은 빠진다. */
export function parseYesanCalendar(html: string): Month {
  const days: Month = {};
  const cells = html.split(/<td\b/).slice(1);
  for (const cell of cells) {
    const date = cell.match(/data-search-bgng-dt="(\d{4}-\d{2}-\d{2})"/)?.[1];
    if (!date || !/class="[^"]*possible/.test(cell)) continue;
    const zones: Record<string, number> = {};
    for (const [, letter, body] of cell.matchAll(/<li class="site ([a-z])[^"]*">([\s\S]*?)<\/li>/g)) {
      zones[`${letter.toUpperCase()}구역`] = Number(body.match(/(\d+)개/)?.[1] ?? 0);
    }
    if (Object.keys(zones).length) days[date] = zones;
  }
  return days;
}

async function month(year: number, m: number) {
  const url = `${ORIGIN}/prog/fclty/camping/sub01_02/getCalendar.do?year=${year}&month=${m}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return parseYesanCalendar(await res.text());
}

/** 이번 달부터 세 달까지 묻고, 예약 받는 날이 없는 달에서 멈춘다. */
function calendar(camp: CampRef): Promise<Month> {
  return memo(`portal:${camp.id}:calendar`, 2 * MINUTE, async () => {
    const [year, m] = todayISO().split("-").map(Number);
    const all: Month = {};
    for (let i = 0; i < 3; i += 1) {
      const y = year + Math.floor((m - 1 + i) / 12);
      const mm = ((m - 1 + i) % 12) + 1;
      const found = await month(y, mm);
      if (!Object.keys(found).length && i > 0) break;
      Object.assign(all, found);
    }
    if (!Object.keys(all).length) throw new Error("예약 받는 날을 찾지 못했습니다");
    return all;
  });
}

export const yesan: CampProvider = {
  id: "yesan",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return [{ id: `${portal.id}:yedang`, portalId: portal.id, slug: "yedang", name: "예산 예당 국민여가캠핑장" }];
  },

  async bookingWindow(_portal, camp) {
    const dates = Object.keys(await calendar(camp)).sort();
    return { start: dates[0], end: dates.at(-1)!, maxStay: null, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const all = await calendar(camp);
    const names = [...new Set(Object.values(all).flatMap((day) => Object.keys(day)))].sort();
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    const zones: Zone[] = names.map((name, order) => {
      counts[name] = nights > 1 ? 0 : (all[date]?.[name] ?? 0);
      amounts[name] = null;
      return { no: name, name, total: 0, size: "", maxPeop: 0, order, photo: null, ground: "" };
    });
    // 달력은 1박 기준이다. 여러 박은 물을 길이 없다 — 모름이다.
    return { zones, counts, amounts, unanswered: nights > 1 } satisfies ZoneDay;
  },

  async roomDay() {
    return { rooms: [], available: [] };
  },

  bookingTarget() {
    return { url: `${ORIGIN}/prog/fclty/camping/sub01_02/calendar.do`, method: "GET", fields: {} };
  },
};
