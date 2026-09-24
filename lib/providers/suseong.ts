import { MINUTE, memo } from "@/lib/cache";
import { todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 대구 수성구 진밭골야영장(www.suseong.kr/camping). 캠핑장 하나짜리다.
 *
 * "예약현황" 달력(`reservationState.do`, POST parmYear·parmMonth)에 날마다 구역(카라반·오토캠핑·
 * 데크)별 남은 수가 `data-origin-value="7"` 로 있다. 로그인 없이 온다(2026-09-25 실측).
 * 이번 달과 다음 달만 연다("다음달 마지막일까지만 예약가능합니다").
 *
 * 화면은 오후 5시가 지나면 오늘 칸을 0으로 바꿔 고르지 못하게 한다. 같은 규칙을 따른다.
 * 칸은 1박 기준이라 2박 이상은 모름이다.
 */

const PAGE = "https://www.suseong.kr/camping/reservation/reservationState.do";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/** 날짜 → 구역 이름 → 남은 수. 구역이 없는 날은 빠진다. */
export function parseSuseong(html: string): Record<string, Record<string, number>> {
  const days: Record<string, Record<string, number>> = {};
  const page = html.replace(/\s+/g, " ");
  const pattern =
    /<li><p>([^<]+)<\/p>\s*<div>\s*<span class="\w+"[^>]*data-id="(\d{4})-(\d{1,2})-(\d{1,2})" data-origin-value="(\d+)"/g;
  for (const [, zone, year, month, day, left] of page.matchAll(pattern)) {
    const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    (days[date] ??= {})[zone.trim()] = Number(left);
  }
  return days;
}

async function month(year: number, m: number) {
  const res = await fetch(PAGE, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Referer: PAGE },
    body: new URLSearchParams({ parmYear: String(year), parmMonth: String(m) }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`진밭골 달력(${year}-${m}) → HTTP ${res.status}`);
  return parseSuseong(await res.text());
}

function calendar(camp: CampRef) {
  return memo(`portal:${camp.id}:calendar`, 2 * MINUTE, async () => {
    const [year, m] = todayISO().split("-").map(Number);
    const next = m === 12 ? [year + 1, 1] : [year, m + 1];
    const days = { ...(await month(year, m)), ...(await month(next[0], next[1])) };
    if (!Object.keys(days).length) throw new Error("예약 받는 날을 찾지 못했습니다");
    return days;
  });
}

/** 서울 시각의 시(0–23). */
const seoulHour = () =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" }).format(new Date()));

export const suseong: CampProvider = {
  id: "suseong",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return [{ id: `${portal.id}:jinbatgol`, portalId: portal.id, slug: "jinbatgol", name: "대구 진밭골야영장" }];
  },

  async bookingWindow(_portal, camp) {
    const dates = Object.keys(await calendar(camp)).filter((date) => date >= todayISO()).sort();
    if (!dates.length) return null;
    return { start: dates[0], end: dates.at(-1)!, maxStay: null, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const days = await calendar(camp);
    const names = [...new Set(Object.values(days).flatMap((day) => Object.keys(day)))];
    const closedToday = date === todayISO() && seoulHour() >= 17;
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    const zones: Zone[] = names.map((name, order) => {
      counts[name] = nights > 1 || closedToday ? 0 : (days[date]?.[name] ?? 0);
      amounts[name] = null;
      return {
        no: name,
        name,
        total: 0,
        unit: name === "카라반" ? "동" : undefined,
        size: "",
        maxPeop: 0,
        order,
        photo: null,
        ground: "",
      };
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
