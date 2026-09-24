import { MINUTE, memo } from "@/lib/cache";
import type { CampProvider, CampRef, Portal, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 광명도시공사 도덕산캠핑장(www.gmuc.co.kr). 캠핑장 하나짜리다.
 *
 * "캠핑장 예약 현황" 화면 한 장(campReserve.do)에 이번 달과 다음 달 달력이 같이 들어 있다
 * (`<tr class="trBefore">` / `<tr class="trAfter">`, 달 이름은 이전·다음 버튼 스크립트에).
 * 날짜마다 구역별 남은 수가 `A구역 : 19` 로 적혀 있고, 예약을 받지 않는 날(오늘까지)은
 * `A구역 : 예약마감` 이다. 로그인 없이 온다(2026-09-25 실측). 예약 자체는 따로 로그인하는
 * reserve.gmuc.co.kr 에서 한다 — 거기는 묻지 않는다.
 *
 * 칸은 1박 기준이다. 여러 박을 물을 길이 없어 2박 이상은 모름이다.
 */

const PAGE = "https://www.gmuc.co.kr/user/conn/campReserve.do";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/** 날짜 → 구역 이름 → 남은 수. 예약마감(받지 않는 날)은 빠진다. */
export type GmucDays = Record<string, Record<string, number>>;

export function parseGmuc(html: string): GmucDays {
  const page = html.replace(/\s+/g, " ");
  const monthOf = (flag: string) => {
    const hit = page.match(
      new RegExp(`flag=="${flag}"\\)\\{ \\$\\("#reservDate"\\)\\.text\\("(\\d{4})년 (\\d{1,2})월`),
    );
    return hit ? `${hit[1]}-${hit[2].padStart(2, "0")}` : null;
  };
  const months: [string, string | null][] = [
    ["trBefore", monthOf("btnBefore")],
    ["trAfter", monthOf("btnAfter")],
  ];
  if (!months[0][1]) throw new Error("예약 현황 달력을 찾지 못했습니다");

  const days: GmucDays = {};
  for (const [row, month] of months) {
    if (!month) continue;
    for (const [, cells] of page.matchAll(new RegExp(`<tr class="${row}">(.*?)</tr>`, "g"))) {
      for (const [, cell] of cells.matchAll(/<td>(.*?)<\/td>/g)) {
        const day = cell.match(/<div class="date">(\d{1,2})<\/div>/)?.[1];
        if (!day) continue;
        const zones: Record<string, number> = {};
        for (const [, zone, left] of cell.matchAll(/>([^<>:]+?) : (\d+)</g)) zones[zone.trim()] = Number(left);
        if (Object.keys(zones).length) days[`${month}-${day.padStart(2, "0")}`] = zones;
      }
    }
  }
  if (!Object.keys(days).length) throw new Error("예약 받는 날을 찾지 못했습니다");
  return days;
}

function calendar(camp: CampRef): Promise<GmucDays> {
  return memo(`portal:${camp.id}:calendar`, 2 * MINUTE, async () => {
    const res = await fetch(PAGE, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) throw new Error(`${PAGE} → HTTP ${res.status}`);
    return parseGmuc(await res.text());
  });
}

export const gmuc: CampProvider = {
  id: "gmuc",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return [{ id: `${portal.id}:dodeoksan`, portalId: portal.id, slug: "dodeoksan", name: "광명 도덕산캠핑장" }];
  },

  async bookingWindow(_portal, camp) {
    const dates = Object.keys(await calendar(camp)).sort();
    return { start: dates[0], end: dates.at(-1)!, maxStay: null, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const days = await calendar(camp);
    const names = [...new Set(Object.values(days).flatMap((day) => Object.keys(day)))].sort();
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    const zones: Zone[] = names.map((name, order) => {
      counts[name] = nights > 1 ? 0 : (days[date]?.[name] ?? 0);
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
    return { url: PAGE, method: "GET", fields: {} };
  },
};
