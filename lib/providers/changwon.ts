import { MINUTE, createLimiter, memo } from "@/lib/cache";
import { enumerateDates, shiftISO, todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Room, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 창원 달천공원오토캠핑장(camp.changwon.go.kr). 캠핑장 하나짜리다.
 *
 * 예약 화면(`/User/Sub02/reservation.do`)에 구역별 정원(사이트존 /26, 카라반존 /4, 방갈로존 /4)과
 * 전 구역이 찬 날 목록(`fn_finishday_push("2026-10-03")`)이 있다. 입·퇴실을 고르면 화면이
 * `searchYeyakDate.do`(POST, 묵는 밤들을 쉼표로)를 불러 구역별 남은 수(`siteCount` …)와 찬 사이트
 * 번호(`siteList` …)를 받는다. 로그인 없이 온다(2026-09-25 실측). 여러 박도 같은 요청으로 묻는다.
 *
 * 기간은 화면 스크립트 규칙 그대로다 — 내일부터(minDate 1) 다음 달 말일 체크인까지. 찬 날이
 * 하나라도 끼면 화면이 막으므로 없음이다.
 */

const ORIGIN = "https://camp.changwon.go.kr";
const PAGE = `${ORIGIN}/User/Sub02/reservation.do`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const ZONES = [
  { no: "site", name: "사이트존", count: "siteCount", list: "siteList", room: "사이트", unit: undefined },
  { no: "caravan", name: "카라반존", count: "caravanCount", list: "caravanList", room: "카라반", unit: "동" },
  { no: "bg", name: "방갈로존", count: "bgCount", list: "bgList", room: "방갈로", unit: "동" },
] as const;

const limit = createLimiter(2);

type Session = { cookie: string; csrf: string; finished: Set<string>; totals: Record<string, number> };

export function parseChangwonPage(html: string): Omit<Session, "cookie"> {
  const page = html.replace(/\s+/g, " ");
  const totals: Record<string, number> = {};
  for (const [, id, total] of page.matchAll(/id="(siteCount|caravanCount|bgCount)"><\/span> \/(\d+)/g)) {
    totals[id] = Number(total);
  }
  if (Object.keys(totals).length !== ZONES.length) throw new Error("구역 정원을 찾지 못했습니다");
  return {
    csrf: page.match(/name="CSRFToken"\s+value="([^"]+)"/)?.[1] ?? "",
    finished: new Set([...page.matchAll(/fn_finishday_push\("(\d{4}-\d{2}-\d{2})"\)/g)].map(([, date]) => date)),
    totals,
  };
}

function session(): Promise<Session> {
  return memo("portal:changwon:session", 5 * MINUTE, async () => {
    const res = await limit(() => fetch(PAGE, { headers: { "User-Agent": UA }, cache: "no-store" }));
    if (!res.ok) throw new Error(`${PAGE} → HTTP ${res.status}`);
    const cookie = res.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    return { cookie, ...parseChangwonPage(await res.text()) };
  });
}

type Search = Record<string, unknown>;

/** 입실일부터 nights 밤. 화면처럼 밤들을 쉼표로 이어 보낸다. */
function search(date: string, nights: number): Promise<Search> {
  return memo(`portal:changwon:search:${date}:${nights}`, 2 * MINUTE, async () => {
    const { cookie, csrf } = await session();
    const form = new FormData();
    form.append("CSRFToken", csrf);
    form.append("fdate", date);
    form.append("dateString", enumerateDates(date, shiftISO(date, nights - 1)).join(","));
    form.append("phone", "");
    form.append("phonecheck", "");
    const res = await limit(() =>
      fetch(`${ORIGIN}/User/Sub02/searchYeyakDate.do`, {
        method: "POST",
        headers: { "User-Agent": UA, Referer: PAGE, "X-Requested-With": "XMLHttpRequest", ...(cookie && { Cookie: cookie }) },
        body: form,
        cache: "no-store",
      }),
    );
    if (!res.ok) throw new Error(`달천 ${date} → HTTP ${res.status}`);
    return (await res.json()) as Search;
  });
}

/** 다음 달 말일. 화면은 체크아웃을 그 다음 날까지 고르게 한다. */
function lastCheckIn() {
  const [year, month] = todayISO().split("-").map(Number);
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
}

/** 그 일정을 화면이 받아 주는가 — 기간 안이고, 찬 날이 끼지 않았다. */
async function bookable(date: string, nights: number) {
  const tomorrow = shiftISO(todayISO(), 1);
  if (date < tomorrow || shiftISO(date, nights - 1) > lastCheckIn()) return false;
  const { finished } = await session();
  return enumerateDates(date, shiftISO(date, nights - 1)).every((night) => !finished.has(night));
}

export const changwon: CampProvider = {
  id: "changwon",
  cheapWindow: true,

  async listCamps(portal: Portal) {
    return [{ id: `${portal.id}:dalcheon`, portalId: portal.id, slug: "dalcheon", name: "창원 달천공원오토캠핑장" }];
  },

  async bookingWindow() {
    return { start: shiftISO(todayISO(), 1), end: lastCheckIn(), maxStay: null, minStay: null };
  },

  async zoneDay(_portal, _camp: CampRef, date, nights) {
    const { totals } = await session();
    const result = (await bookable(date, nights)) ? await search(date, nights) : null;
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    const zones: Zone[] = ZONES.map((zone, order) => {
      counts[zone.no] = Number(result?.[zone.count] ?? 0) || 0;
      amounts[zone.no] = null;
      return {
        no: zone.no,
        name: zone.name,
        total: totals[zone.count],
        unit: zone.unit,
        size: "",
        maxPeop: 0,
        order,
        photo: null,
        ground: "",
      };
    });
    return { zones, counts, amounts } satisfies ZoneDay;
  },

  async roomDay(_portal, _camp, zoneNo, date, nights) {
    const zone = ZONES.find((z) => z.no === zoneNo);
    if (!zone) return null;
    const { totals } = await session();
    const rooms: Room[] = Array.from({ length: totals[zone.count] }, (_, i) => ({
      no: `${zone.no}:${i + 1}`,
      zoneNo,
      name: `${zone.room} ${i + 1}`,
      amount: null,
      size: "",
    }));
    if (!(await bookable(date, nights))) return { rooms, available: [] };
    const list = (await search(date, nights))[zone.list];
    const taken = new Set(Array.isArray(list) ? list.map((entry: { site: number }) => entry.site) : []);
    return { rooms, available: rooms.filter((_, i) => !taken.has(i + 1)).map((room) => room.no) };
  },

  bookingTarget() {
    return { url: PAGE, method: "GET", fields: {} };
  },
};
