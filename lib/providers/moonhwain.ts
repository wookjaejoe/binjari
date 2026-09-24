import { MINUTE, memo } from "@/lib/cache";
import { compactToISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, ZoneDay } from "@/lib/providers/types";

/**
 * 문화인(moonhwain.net) 예약. 공공 공연장 발권이 주업이고 캠핑장 몇 곳이 같은 화면을 쓴다.
 *
 * 예약 화면(rsv_srm.html)에 예약 기간 전체의 날짜별 남은 수가 숨은 입력값으로 박혀 있다
 * (`<input id="actDate" value="20260928:11,20260929:15,…">`). 로그인 없이 한 번에 온다.
 * 사이트별 목록은 날짜를 누른 뒤 캡차(reCAPTCHA)를 거쳐야 보인다 — 그 너머는 묻지 않는다.
 * 그래서 구역은 "전체" 하나이고, 칸은 그 날 캠핑장 전체의 남은 수다.
 *
 * 날짜 칸은 1박 기준이다. 여러 박을 묻는 길은 캡차 너머에 있어 2박 이상은 모름이다.
 */

export const MOONHWAIN_CAMPS: { slug: string; name: string; host: string; bid: string }[] = [
  { slug: "sejong-jeonwolsan", name: "세종 전월산캠핑장", host: "sjfmc.moonhwain.net:451", bid: "jeonwolsan" },
  { slug: "gumi-nakdonggang", name: "구미 낙동강캠핑장", host: "gmcamping.moonhwain.net:451", bid: "gmcamp" },
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const campOf = (camp: CampRef) => {
  const found = MOONHWAIN_CAMPS.find((c) => c.slug === camp.slug);
  if (!found) throw new Error(`문화인 캠핑장이 아닙니다: ${camp.slug}`);
  return found;
};

const pageUrl = (camp: CampRef) => {
  const { host, bid } = campOf(camp);
  return `https://${host}/rsvc/rsv_srm.html?b_id=${bid}`;
};

/** actDate 숨은 값 → 날짜별 남은 수. */
export function parseActDate(html: string): Record<string, number> {
  const value = html.match(/id="actDate"[^>]*value="([^"]*)"/)?.[1];
  if (value == null) throw new Error("예약 달력(actDate)을 찾지 못했습니다");
  const days: Record<string, number> = {};
  for (const pair of value.split(",")) {
    const [date, left] = pair.split(":");
    if (/^\d{8}$/.test(date)) days[compactToISO(date)] = Number(left) || 0;
  }
  if (!Object.keys(days).length) throw new Error("예약 달력이 비어 있습니다");
  return days;
}

function days(camp: CampRef) {
  return memo(`portal:${camp.id}:days`, 2 * MINUTE, async () => {
    const res = await fetch(pageUrl(camp), { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) throw new Error(`${pageUrl(camp)} → HTTP ${res.status}`);
    return parseActDate(await res.text());
  });
}

const ZONE = "all";

export const moonhwain: CampProvider = {
  id: "moonhwain",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return MOONHWAIN_CAMPS.map((c) => ({
      id: `${portal.id}:${c.slug}`,
      portalId: portal.id,
      slug: c.slug,
      name: c.name,
    }));
  },

  async bookingWindow(_portal, camp) {
    const dates = Object.keys(await days(camp)).sort();
    return { start: dates[0], end: dates.at(-1)!, maxStay: null, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const left = (await days(camp))[date];
    return {
      zones: [
        { no: ZONE, name: "전체", total: 0, unit: "자리", size: "", maxPeop: 0, order: 0, photo: null, ground: "" },
      ],
      counts: { [ZONE]: nights > 1 ? 0 : (left ?? 0) },
      amounts: { [ZONE]: null },
      // 여러 박은 물을 길이 없다 — 없음이 아니라 모름이다.
      unanswered: nights > 1,
    } satisfies ZoneDay;
  },

  /** 사이트 목록은 캡차 너머에 있다. 객실 단계가 없다. */
  async roomDay() {
    return { rooms: [], available: [] };
  },

  bookingTarget(_portal, camp) {
    const { host, bid } = campOf(camp);
    return { url: `https://${host}/rsvc/rsv_srm.html`, method: "GET", fields: { b_id: bid } };
  },
};
