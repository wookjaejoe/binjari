import { MINUTE, memo } from "@/lib/cache";
import { todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 스마틱스(Smartix)의 숙박 예약 플랫폼 "Forest MakeTicket"(forest.maketicket.co.kr). 지자체
 * 캠핑장 여럿이 같은 화면을 쓰고 상품 번호(`GD41`)와 업체 키(`idkey`)로 갈린다. 둘 다 상품
 * 화면(`/ticket/GD41`)에 박혀 있는 고정값이다.
 *
 * 달력 조각(`/camp/reserve/calendar.jsp`, POST)이 달마다 날짜 × 구역의 남은 수를 준다 —
 * `f_SelectDateZone("20261001", "CM000172", "SD69104", "3", "7")` 의 마지막 값과 `<span>7</span>`.
 * 로그인 없이 온다(2026-09-25 실측). 칸은 1박 기준이라 2박 이상은 모름이다.
 *
 * 같은 플랫폼 목록의 세종합강·화성 향남·의왕 왕송호수·백두대간생태수목원(GD86·GD90·GD91·GD6)은
 * 9·10월 달력이 비어 있고, 전월산(GD98)은 "종료"다(지금은 문화인). 넣지 않았다.
 */

const ORIGIN = "https://forest.maketicket.co.kr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_MONTHS = 3;

export const MAKETICKET_CAMPS: { slug: string; name: string; gd: string; idkey: string }[] = [
  { slug: "jangho", name: "삼척 장호비치캠핑장", gd: "GD41", idkey: "5M8190" },
  { slug: "yeomjeon", name: "울진 염전해변캠핑장", gd: "GD110", idkey: "5M4360" },
];

const campOf = (camp: CampRef) => {
  const found = MAKETICKET_CAMPS.find((c) => c.slug === camp.slug);
  if (!found) throw new Error(`MakeTicket 캠핑장이 아닙니다: ${camp.slug}`);
  return found;
};

/** 날짜 → 구역 코드 → { 이름, 남은 수 }. 구역이 하나도 없는 날(지난 날·안 여는 날)은 빠진다. */
export type MakeTicketDays = Record<string, Record<string, { name: string; left: number }>>;

export function parseMakeTicket(html: string): MakeTicketDays {
  const days: MakeTicketDays = {};
  const pattern =
    /f_SelectDateZone\(\s*"(\d{8})"\s*,\s*"([^"]+)"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"(\d+)"\s*\);'>\s*<span>\d+<\/span>([^<]+)</g;
  for (const [, compact, code, left, name] of html.matchAll(pattern)) {
    const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
    (days[date] ??= {})[code] = { name: name.trim(), left: Number(left) };
  }
  return days;
}

async function month(camp: CampRef, yyyymmdd: string) {
  const { gd, idkey } = campOf(camp);
  const res = await fetch(`${ORIGIN}/camp/reserve/calendar.jsp`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${ORIGIN}/ticket/${gd}`,
    },
    body: new URLSearchParams({ idkey, gd_seq: gd, yyyymmdd, sd_date: yyyymmdd }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${gd} 달력(${yyyymmdd}) → HTTP ${res.status}`);
  return parseMakeTicket(await res.text());
}

/** 이번 달부터 세 달까지. 예약 받는 날이 없는 달에서 멈춘다. */
function calendar(camp: CampRef): Promise<MakeTicketDays> {
  return memo(`portal:${camp.id}:calendar`, 2 * MINUTE, async () => {
    const [year, m] = todayISO().split("-").map(Number);
    const all: MakeTicketDays = {};
    for (let i = 0; i < MAX_MONTHS; i += 1) {
      const y = year + Math.floor((m - 1 + i) / 12);
      const mm = ((m - 1 + i) % 12) + 1;
      const found = await month(camp, `${y}${String(mm).padStart(2, "0")}10`);
      if (!Object.keys(found).length && i > 0) break;
      Object.assign(all, found);
    }
    if (!Object.keys(all).length) throw new Error("예약 받는 날을 찾지 못했습니다");
    return all;
  });
}

export const maketicket: CampProvider = {
  id: "maketicket",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return MAKETICKET_CAMPS.map((c) => ({
      id: `${portal.id}:${c.slug}`,
      portalId: portal.id,
      slug: c.slug,
      name: c.name,
    }));
  },

  async bookingWindow(_portal, camp) {
    const dates = Object.keys(await calendar(camp)).sort();
    return { start: dates[0], end: dates.at(-1)!, maxStay: null, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const days = await calendar(camp);
    const names = new Map<string, string>();
    for (const day of Object.values(days)) {
      for (const [code, { name }] of Object.entries(day)) names.set(code, name);
    }
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    const zones: Zone[] = [...names].map(([code, name], order) => {
      counts[code] = nights > 1 ? 0 : (days[date]?.[code]?.left ?? 0);
      amounts[code] = null;
      return {
        no: code,
        name,
        total: 0,
        unit: /카라반|캐라반|하우스/.test(name) ? "동" : undefined,
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

  bookingTarget(_portal, camp) {
    return { url: `${ORIGIN}/ticket/${campOf(camp).gd}`, method: "GET", fields: {} };
  },
};
