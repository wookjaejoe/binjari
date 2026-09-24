import { MINUTE, createLimiter, memo } from "@/lib/cache";
import { enumerateDates, todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Room, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 울주군립야영장 통합 예약(camping.ulju.ulsan.kr). 작천정별빛·등억알프스·작천정달빛·대운산하늘숲
 * 네 곳이 한 화면을 쓰고 `classes` 값으로 갈린다.
 *
 * 예약 화면(`/ujcamping/campsite/booking`)이 날짜를 누를 때 부르는 JSON
 * (`get_cal_day_data_list`, POST)이 그 날 1박으로 캠핑장의 사이트 전부를 준다 — 구역
 * (`FACILITY_NAME`), 이름, 예약할 수 있는지(`ISRESERVABLE` Y/N). 로그인 없이 온다(2026-09-25 실측,
 * 세션 쿠키만 받아 둔다). 날짜마다 한 번씩 묻는다.
 *
 * 포털은 "현재 달과 다음 달까지만" 답하고(그 밖은 `booking_ended`), 오늘은 오후 5시가 지나면
 * 같은 답을 준다 — 둘 다 없음이다. 목록이 1박 기준이라 2박 이상은 모름이다.
 */

const BASE = "https://camping.ulju.ulsan.kr/ujcamping";
const PAGE = `${BASE}/campsite/booking`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

export const ULJU_CAMPS: { slug: string; name: string; classes: string }[] = [
  { slug: "jakcheonjeong-byeolbit", name: "울주 작천정별빛야영장", classes: "C0000001" },
  { slug: "deungeok-alps", name: "울주 등억알프스야영장", classes: "C0000002" },
  { slug: "jakcheonjeong-dalbit", name: "울주 작천정달빛야영장", classes: "C0000003" },
  { slug: "daeunsan", name: "울주 대운산하늘숲야영장", classes: "C0000005" },
];

/** 군청 서버 한 대에 네 곳이 있다. 날짜마다 묻는 만큼 동시에 두 개로 묶는다. */
const limit = createLimiter(2);

const campOf = (camp: CampRef) => {
  const found = ULJU_CAMPS.find((c) => c.slug === camp.slug);
  if (!found) throw new Error(`울주 캠핑장이 아닙니다: ${camp.slug}`);
  return found;
};

export type UljuSite = { id: string; name: string; zone: string; open: boolean };

type DayResponse = {
  result: string;
  msg?: string;
  list?: { CAMP_ID: string; NAME: string; FACILITY_NAME: string; ISRESERVABLE: string }[];
};

/** 응답 → 사이트. 예약을 받지 않는 날(booking_ended)·목록 없음(no_list)은 빈 목록이다. */
export function parseUljuDay(body: DayResponse): UljuSite[] {
  if (body.result === "booking_ended" || body.result === "no_list") return [];
  if (body.result !== "ok") throw new Error(`울주 날짜 조회 실패(${body.result})`);
  return (body.list ?? []).map((site) => ({
    id: site.CAMP_ID,
    name: site.NAME.trim(),
    zone: site.FACILITY_NAME.trim(),
    open: site.ISRESERVABLE === "Y",
  }));
}

function cookie(): Promise<string> {
  return memo("portal:ulju:session", 10 * MINUTE, async () => {
    const res = await limit(() => fetch(PAGE, { headers: { "User-Agent": UA }, cache: "no-store" }));
    if (!res.ok) throw new Error(`${PAGE} → HTTP ${res.status}`);
    return res.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
  });
}

function day(camp: CampRef, date: string): Promise<UljuSite[]> {
  return memo(`portal:${camp.id}:day:${date}`, 2 * MINUTE, async () => {
    const jar = await cookie();
    const res = await limit(() =>
      fetch(`${BASE}/campsite/get_cal_day_data_list`, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/json",
          "X-HTTP-Method-Override": "POST",
          Referer: PAGE,
          ...(jar && { Cookie: jar }),
        },
        body: JSON.stringify({
          sql_state: "GetData",
          select_date: date,
          classes: campOf(camp).classes,
          facility: "",
          use_only: "N",
        }),
        cache: "no-store",
      }),
    );
    if (!res.ok) throw new Error(`울주 ${date} → HTTP ${res.status}`);
    return parseUljuDay((await res.json()) as DayResponse);
  });
}

/** 오늘부터 다음 달 마지막 날까지. 포털이 스스로 밝힌 조회 범위다. */
function windowDates() {
  const today = todayISO();
  const [year, month] = today.split("-").map(Number);
  const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  return enumerateDates(today, end);
}

/** 구역 목록은 날마다 같다. 기간 중 사이트가 나온 첫 날에서 읽는다. */
async function zonesOf(camp: CampRef): Promise<{ zones: Zone[]; sites: UljuSite[] }> {
  for (const date of windowDates()) {
    const sites = await day(camp, date);
    if (!sites.length) continue;
    const names = [...new Set(sites.map((site) => site.zone))];
    const zones = names.map((name, order) => ({
      no: name,
      name,
      total: sites.filter((site) => site.zone === name).length,
      unit: /카라반|캐빈|하우스/.test(name) ? "동" : undefined,
      size: "",
      maxPeop: 0,
      order,
      photo: null,
      ground: "",
    }));
    return { zones, sites };
  }
  return { zones: [], sites: [] };
}

export const ulju: CampProvider = {
  id: "ulju",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return ULJU_CAMPS.map((c) => ({
      id: `${portal.id}:${c.slug}`,
      portalId: portal.id,
      slug: c.slug,
      name: c.name,
    }));
  },

  async bookingWindow() {
    const dates = windowDates();
    return { start: dates[0], end: dates.at(-1)!, maxStay: null, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const { zones } = await zonesOf(camp);
    const sites = nights > 1 ? [] : await day(camp, date);
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    for (const zone of zones) {
      counts[zone.no] = sites.filter((site) => site.zone === zone.no && site.open).length;
      amounts[zone.no] = null;
    }
    // 목록은 1박 기준이다. 여러 박은 물을 길이 없다 — 모름이다.
    return { zones, counts, amounts, unanswered: nights > 1 } satisfies ZoneDay;
  },

  async roomDay(_portal, camp, zoneNo, date, nights) {
    if (nights > 1) return null;
    const { sites: known } = await zonesOf(camp);
    const sites = await day(camp, date);
    const rooms: Room[] = known
      .filter((site) => site.zone === zoneNo)
      .map((site) => ({ no: site.id, zoneNo, name: site.name, amount: null, size: "" }));
    const open = new Set(sites.filter((site) => site.open).map((site) => site.id));
    return { rooms, available: rooms.filter((room) => open.has(room.no)).map((room) => room.no) };
  },

  bookingTarget() {
    return { url: PAGE, method: "GET", fields: {} };
  },
};
