import { MINUTE, createLimiter, memo } from "@/lib/cache";
import { shiftISO, todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Room, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 부산 대저생태공원캠핑장(www.daejeocamping.com). 캠핑장 하나짜리다.
 *
 * "실시간 예약" 화면(`/reservation/real_time?resdate=&schGugun=`)이 그 일정의 사이트 배치도를
 * 그린다. 사이트마다 `cbtn_on`(예약가능)·`cbtn_Pcomplete`(예약완료)·`cbtn_Pcancel`(취소분, 다음
 * 날 9시에 풀림) 같은 상태와 구역(`sitetype` A–D)이 있다. `cbtn_on` 만 지금 예약할 수 있다.
 * 로그인 없이 온다(2026-09-25 실측). 날짜마다 한 번씩 묻는다.
 *
 * - 박수는 포털이 직접 답한다(`schGugun` 1박·2박). 그보다 길면 없음이다.
 * - 기간은 화면 스크립트의 규칙 그대로다 — 매달 5일 13시가 지나면 다음 달 말일까지, 그 전에는
 *   이번 달 말일까지. 2박은 달의 마지막 날에 시작할 수 없다.
 * - 요금은 평일·주말 두 값이 같이 있고 그 날이 어느 쪽인지 포털이 말하지 않아 비워 둔다.
 */

const ORIGIN = "https://www.daejeocamping.com";
const PAGE = `${ORIGIN}/reservation/real_time`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_NIGHTS = 2;

const limit = createLimiter(2);

export type DaejeoSite = { id: string; zone: string; name: string; open: boolean };

export function parseDaejeo(html: string): DaejeoSite[] {
  const page = html.replace(/\s+/g, " ");
  const pattern =
    /<a href="" class="cbtn area_\w+ cbtn_\d+ (cbtn_\w+)[^"]*">.*?class="siteid" value="(\d+)">.*?class="sitetype" value="(\w+)">.*?class="sitename" value="([^"]+)">/g;
  return [...page.matchAll(pattern)].map(([, state, id, zone, name]) => ({
    id,
    zone,
    name: `${zone}-${name}`,
    open: state === "cbtn_on",
  }));
}

/** 서울 시각 [일, 시]. */
function seoulDayHour() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return [get("day"), get("hour")];
}

/** 화면 스크립트의 최대 예약일: 5일 13시가 지나면 다음 달 말일, 아니면 이번 달 말일. */
function lastDay() {
  const [year, month] = todayISO().split("-").map(Number);
  const [day, hour] = seoulDayHour();
  const live = day > 5 || (day === 5 && hour >= 13);
  return new Date(Date.UTC(year, month - 1 + (live ? 2 : 1), 0)).toISOString().slice(0, 10);
}

const isMonthEnd = (date: string) => shiftISO(date, 1).endsWith("-01");

function sitesOn(date: string, nights: number): Promise<DaejeoSite[]> {
  return memo(`portal:daejeo:day:${date}:${nights}`, 2 * MINUTE, async () => {
    const url = `${PAGE}?resdate=${date}&schGugun=${nights}`;
    const res = await limit(() => fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" }));
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const sites = parseDaejeo(await res.text());
    if (!sites.length) throw new Error("사이트 배치도를 찾지 못했습니다");
    return sites;
  });
}

async function available(date: string, nights: number): Promise<DaejeoSite[]> {
  if (nights > MAX_NIGHTS || (nights === 2 && isMonthEnd(date))) return [];
  return (await sitesOn(date, nights)).filter((site) => site.open);
}

export const daejeo: CampProvider = {
  id: "daejeo",
  cheapWindow: true,

  async listCamps(portal: Portal) {
    return [{ id: `${portal.id}:daejeo`, portalId: portal.id, slug: "daejeo", name: "부산 대저생태공원캠핑장" }];
  },

  async bookingWindow() {
    return { start: todayISO(), end: lastDay(), maxStay: MAX_NIGHTS, minStay: null };
  },

  async zoneDay(_portal, _camp: CampRef, date, nights) {
    // 구역과 사이트 수는 오늘 1박 배치도에서 읽는다. 날마다 같다.
    const all = await sitesOn(todayISO(), 1);
    const open = await available(date, nights);
    const letters = [...new Set(all.map((site) => site.zone))].sort();
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    const zones: Zone[] = letters.map((letter, order) => {
      counts[letter] = open.filter((site) => site.zone === letter).length;
      amounts[letter] = null;
      return {
        no: letter,
        name: `${letter}구역`,
        total: all.filter((site) => site.zone === letter).length,
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
    const all = await sitesOn(todayISO(), 1);
    const open = new Set((await available(date, nights)).map((site) => site.id));
    const rooms: Room[] = all
      .filter((site) => site.zone === zoneNo)
      .map((site) => ({ no: site.id, zoneNo, name: site.name, amount: null, size: "" }));
    return { rooms, available: rooms.filter((room) => open.has(room.no)).map((room) => room.no) };
  },

  bookingTarget(_portal, _camp, checkIn, nights) {
    return {
      url: PAGE,
      method: "GET",
      fields: { resdate: checkIn, schGugun: String(Math.min(nights, MAX_NIGHTS)) },
    };
  },
};
