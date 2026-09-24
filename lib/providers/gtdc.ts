import { MINUTE, memo } from "@/lib/cache";
import { todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 강릉관광개발공사 연곡해변 솔향기캠핑장(camping.gtdc.or.kr). 캠핑장 하나짜리다.
 *
 * 예약 화면(`/pub/reserv.do`)이 부르는 JSON 두 가지로 끝난다(2026-09-25 실측, 로그인 없음).
 * - `reserv-01-calendar.json` actMode=init — 구역(A-대형데크 …)과 구역마다 사이트 수(`tot`)
 * - 같은 주소 actMode=month_state — 달력에 보이는 날마다 구역별로 **찬** 수(`block`)
 * 남은 수는 `tot - block` 이고, block 에 없는 날은 예약 버튼이 꺼진 채다(예약을 받지 않는 날).
 * 화면의 스크립트와 같은 계산이다. 요청마다 `Author: YmdHis` 헤더를 붙인다.
 *
 * 구역은 언어별로 등록돼 있어 `Accept-Language` 가 한국어가 아니면 빈 배열이 온다. Node 의
 * fetch 는 기본으로 `*` 를 보낸다 — 한국어를 적어 보낸다.
 *
 * 칸은 1박 기준이다. 여러 박은 사이트 배치도(구역 × 날짜마다 한 번)에서만 물을 수 있어
 * 2박 이상은 모름으로 둔다.
 */

const ORIGIN = "https://camping.gtdc.or.kr";
const ENDPOINT = `${ORIGIN}/dzSmart/plugins/Reserv/procedure/reserv-01-calendar.json`;
const PAGE = `${ORIGIN}/pub/reserv.do`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_MONTHS = 3;

type Init = { zones?: Record<string, { tit: string; tot: string }> };
type MonthState = { block?: Record<string, Record<string, string>> | [] };

/** 서울 시각 "20260925013000". 포털 스크립트가 보내는 값과 같은 모양이다. */
function stamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
}

async function call<T>(params: Record<string, string>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept-Language": "ko-KR,ko;q=0.9",
      Referer: PAGE,
      Author: stamp(),
    },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`연곡 달력(${params.actMode}) → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export type GtdcCalendar = {
  zones: { id: string; name: string; total: number }[];
  /** 날짜 → 구역 id → 남은 수. 예약을 받는 날만 있다. */
  days: Record<string, Record<string, number>>;
};

/** month_state 의 block("26-10-03": {"1": "53"}) 을 남은 수로 바꾼다. */
export function remaining(
  zones: GtdcCalendar["zones"],
  block: MonthState["block"],
): GtdcCalendar["days"] {
  const days: GtdcCalendar["days"] = {};
  if (!block || Array.isArray(block)) return days;
  for (const [key, taken] of Object.entries(block)) {
    const [yy, mm, dd] = key.split("-");
    days[`20${yy}-${mm}-${dd}`] = Object.fromEntries(
      zones.map(({ id, total }) => [id, Math.max(0, total - Number(taken[id] ?? 0))]),
    );
  }
  return days;
}

function calendar(camp: CampRef): Promise<GtdcCalendar> {
  return memo(`portal:${camp.id}:calendar`, 2 * MINUTE, async () => {
    const [year, m] = todayISO().split("-").map(Number);
    const monthOf = (i: number) =>
      `${year + Math.floor((m - 1 + i) / 12)}${String(((m - 1 + i) % 12) + 1).padStart(2, "0")}`;

    const init = await call<Init>({ actMode: "init", month: monthOf(0) });
    const zones = Object.entries(init.zones ?? {}).map(([id, zone]) => ({
      id,
      name: zone.tit,
      total: Number(zone.tot) || 0,
    }));
    if (!zones.length) throw new Error("구역을 찾지 못했습니다");

    const days: GtdcCalendar["days"] = {};
    for (let i = 0; i < MAX_MONTHS; i += 1) {
      const state = await call<MonthState>({ actMode: "month_state", month: monthOf(i) });
      const found = remaining(zones, state.block);
      // 달력은 앞뒤 달의 날도 같이 보여준다. 겹치는 날은 나중 것이 같다.
      Object.assign(days, found);
      if (!Object.keys(found).length && i > 0) break;
    }
    if (!Object.keys(days).length) throw new Error("예약 받는 날을 찾지 못했습니다");
    return { zones, days };
  });
}

export const gtdc: CampProvider = {
  id: "gtdc",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return [{ id: `${portal.id}:yeongok`, portalId: portal.id, slug: "yeongok", name: "강릉 연곡해변 솔향기캠핑장" }];
  },

  async bookingWindow(_portal, camp) {
    const dates = Object.keys((await calendar(camp)).days).filter((date) => date >= todayISO()).sort();
    if (!dates.length) return null;
    return { start: dates[0], end: dates.at(-1)!, maxStay: null, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const { zones, days } = await calendar(camp);
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    const list: Zone[] = zones.map(({ id, name, total }, order) => {
      counts[id] = nights > 1 ? 0 : (days[date]?.[id] ?? 0);
      amounts[id] = null;
      return {
        no: id,
        name,
        total,
        unit: /카라반|글램핑|하우스/.test(name) ? "동" : undefined,
        size: "",
        maxPeop: 0,
        order,
        photo: null,
        ground: "",
      };
    });
    // 달력은 1박 기준이다. 여러 박은 물을 길이 가볍지 않다 — 모름이다.
    return { zones: list, counts, amounts, unanswered: nights > 1 } satisfies ZoneDay;
  },

  async roomDay() {
    return { rooms: [], available: [] };
  },

  bookingTarget() {
    return { url: PAGE, method: "GET", fields: {} };
  },
};
