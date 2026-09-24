import { MINUTE, createLimiter, memo } from "@/lib/cache";
import { shiftISO, todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 강화군시설관리공단 통합예약(www.ghss.or.kr/ttreserve) — 함허동천야영장.
 *
 * 입·퇴실을 고르면 화면이 `room_list.ajax`(POST)를 불러 그 일정에 예약할 수 있는 사이트만 10개씩
 * 준다(`pageNo`, 끝에 `totalPageCount = 6`). 로그인 없이 온다(2026-09-25 실측). 여러 박도 같은
 * 요청으로 포털이 답한다(`stay_cnt`).
 *
 * 한가한 평일은 여섯 쪽까지 간다. 쪽을 다 받지 않고 첫 쪽(쪽 수)과 마지막 쪽(나머지)만 받아
 * `(쪽 수 − 1) × 10 + 마지막 쪽` 으로 센다 — 일정마다 두 번이다. 그래서 사이트 이름은 다 모르고,
 * 객실 단계는 두지 않는다. 금액은 첫 쪽의 사이트가 모두 같은 결제금액일 때만 적는다.
 *
 * 기간은 화면 스크립트 값 그대로다 — 오늘부터 `after_day`(2)일 뒤부터 `finish_date` 전날 체크인까지.
 * 같은 공단의 덕산 국민여가캠핑장은 구역이 셋이라 세 배를 물어야 해서 아직 넣지 않았다.
 */

const BASE = "https://www.ghss.or.kr/ttreserve";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const PAGE_SIZE = 10;

export const GHSS_CAMPS: { slug: string; name: string; facl: string }[] = [
  { slug: "hamheo", name: "강화 함허동천야영장", facl: "camp" },
];

const limit = createLimiter(2);

const campOf = (camp: CampRef) => {
  const found = GHSS_CAMPS.find((c) => c.slug === camp.slug);
  if (!found) throw new Error(`강화 캠핑장이 아닙니다: ${camp.slug}`);
  return found;
};

const pageUrl = (camp: CampRef) => `${BASE}/reserve/${campOf(camp).facl}.do`;

type Page = {
  cookie: string;
  start: string;
  lastCheckIn: string;
  zones: { id: string; name: string }[];
  stops: { start: string; end: string }[];
};

export function parseGhssPage(html: string, today: string): Omit<Page, "cookie"> {
  const page = html.replace(/\s+/g, " ");
  const after = Number(page.match(/var after_day = (\d+);/)?.[1]);
  const finish = page.match(/var finish_date = '(\d{4}-\d{2}-\d{2})';/)?.[1];
  const select = page.match(/<select id="fcgp_id"[^>]*>(.*?)<\/select>/)?.[1] ?? "";
  const zones = [...select.matchAll(/<option value="(\w+)">([^<]+)<\/option>/g)].map(([, id, name]) => ({
    id,
    name: name.trim(),
  }));
  if (!finish || Number.isNaN(after) || !zones.length) throw new Error("예약 화면에서 기간·구역을 찾지 못했습니다");
  const stops = [...(page.match(/var dateRanges = \[(.*?)\];/)?.[1] ?? "").matchAll(
    /start['"]?\s*:\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*['"]?end['"]?\s*:\s*'(\d{4}-\d{2}-\d{2})'/g,
  )].map(([, start, end]) => ({ start, end }));
  return { start: shiftISO(today, after), lastCheckIn: shiftISO(finish, -1), zones, stops };
}

/** 쪽 하나 → 사이트 결제금액들과 전체 쪽 수. */
export function parseGhssList(html: string): { amounts: number[]; pages: number } {
  const page = html.replace(/\s+/g, " ");
  const amounts = [...page.matchAll(/결제금액 : ([\d,]+)원/g)].map(([, won]) => Number(won.replace(/,/g, "")));
  return { amounts, pages: Number(page.match(/totalPageCount = (\d+);/)?.[1] ?? 0) };
}

function page(camp: CampRef): Promise<Page> {
  return memo(`portal:${camp.id}:page`, 10 * MINUTE, async () => {
    const res = await limit(() => fetch(pageUrl(camp), { headers: { "User-Agent": UA }, cache: "no-store" }));
    if (!res.ok) throw new Error(`${pageUrl(camp)} → HTTP ${res.status}`);
    const cookie = res.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    return { cookie, ...parseGhssPage(await res.text(), todayISO()) };
  });
}

async function list(camp: CampRef, zone: string, date: string, nights: number, pageNo: number) {
  const { cookie } = await page(camp);
  const res = await limit(() =>
    fetch(`${BASE}/reserve/room_list.ajax`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: pageUrl(camp),
        ...(cookie && { Cookie: cookie }),
      },
      body: new URLSearchParams({
        facl_id: campOf(camp).facl,
        room_id: "",
        bgng_ymd: date,
        end_ymd: shiftISO(date, nights),
        stay_cnt: String(nights),
        week: "0",
        pageNo: String(pageNo),
        fcgp_id: zone,
      }),
      cache: "no-store",
    }),
  );
  if (!res.ok) throw new Error(`강화 ${date} → HTTP ${res.status}`);
  return parseGhssList(await res.text());
}

/** 그 일정에 예약할 수 있는 사이트 수와 (한결같다면) 결제금액. */
function countFor(camp: CampRef, zone: string, date: string, nights: number) {
  return memo(`portal:${camp.id}:count:${zone}:${date}:${nights}`, 2 * MINUTE, async () => {
    const first = await list(camp, zone, date, nights, 1);
    const amount = first.amounts.length && first.amounts.every((won) => won === first.amounts[0]) ? first.amounts[0] : null;
    if (first.pages <= 1) return { count: first.amounts.length, amount };
    const last = await list(camp, zone, date, nights, first.pages);
    return { count: (first.pages - 1) * PAGE_SIZE + last.amounts.length, amount };
  });
}

async function bookable(camp: CampRef, date: string, nights: number) {
  const { start, lastCheckIn, stops } = await page(camp);
  if (date < start || shiftISO(date, nights - 1) > lastCheckIn) return false;
  const nightsOf = Array.from({ length: nights }, (_, i) => shiftISO(date, i));
  return !nightsOf.some((night) => stops.some((stop) => night >= stop.start && night <= stop.end));
}

export const ghss: CampProvider = {
  id: "ghss",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return GHSS_CAMPS.map((c) => ({
      id: `${portal.id}:${c.slug}`,
      portalId: portal.id,
      slug: c.slug,
      name: c.name,
    }));
  },

  async bookingWindow(_portal, camp) {
    const { start, lastCheckIn } = await page(camp);
    return { start, end: lastCheckIn, maxStay: null, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const { zones } = await page(camp);
    const open = await bookable(camp, date, nights);
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    const list: Zone[] = [];
    for (const [order, { id, name }] of zones.entries()) {
      const found = open ? await countFor(camp, id, date, nights) : { count: 0, amount: null };
      counts[id] = found.count;
      amounts[id] = found.amount;
      list.push({ no: id, name, total: 0, size: "", maxPeop: 0, order, photo: null, ground: "" });
    }
    return { zones: list, counts, amounts } satisfies ZoneDay;
  },

  /** 사이트 이름은 쪽을 다 받아야 알 수 있다. 객실 단계는 두지 않는다. */
  async roomDay() {
    return { rooms: [], available: [] };
  },

  bookingTarget(_portal, camp) {
    return { url: pageUrl(camp), method: "GET", fields: {} };
  },
};
