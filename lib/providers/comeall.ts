import { MINUTE, createLimiter, memo } from "@/lib/cache";
import { shiftISO, todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Room, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 부산 낙동강관리본부 캠핑장 두 곳 — 대저생태공원(www.daejeocamping.com)·삼락생태공원
 * (www.nakdongcamping.com). 한 업체(comeall)가 만든 같은 화면이고 도메인만 다르다.
 *
 * "실시간 예약" 화면(`/reservation/real_time?resdate=&schGugun=`)이 그 일정의 사이트 배치도를
 * 그린다. 사이트마다 `cbtn_on`(예약가능)·`cbtn_Pcomplete`(예약완료)·`cbtn_Pcancel`(취소분, 다음
 * 날 9시에 풀림) 같은 상태와 구역(`sitetype` A–D)이 있다. `cbtn_on` 만 지금 예약할 수 있다.
 * 로그인 없이 온다(2026-09-25 실측). 날짜마다 한 번씩 묻는다.
 *
 * - 박수는 포털이 직접 답한다(`schGugun` 1박·2박). 그보다 길면 없음이다.
 * - 기간은 화면 스크립트의 규칙 그대로다 — 매달 `LIVE_START_DAY`일 `LIVE_START_HOUR`시(대저 5일
 *   13시, 삼락 5일 11시)가 지나면 다음 달 말일까지, 그 전에는 이번 달 말일까지. 두 값은 화면에서
 *   읽는다. 2박은 달의 마지막 날에 시작할 수 없다.
 * - 요금은 평일·주말 두 값이 같이 있고 그 날이 어느 쪽인지 포털이 말하지 않아 비워 둔다.
 */

export const COMEALL_CAMPS: { slug: string; name: string; origin: string }[] = [
  { slug: "daejeo", name: "부산 대저생태공원캠핑장", origin: "https://www.daejeocamping.com" },
  { slug: "samrak", name: "부산 삼락생태공원 오토캠핑장", origin: "https://www.nakdongcamping.com" },
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_NIGHTS = 2;

const limit = createLimiter(2);

export type ComeallSite = { id: string; zone: string; name: string; open: boolean };

export function parseComeall(html: string): ComeallSite[] {
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

/** 화면 스크립트의 예약 시작 시각(매달 며칠 몇 시). */
export function parseLiveStart(html: string): { day: number; hour: number } {
  const day = Number(html.match(/LIVE_START_DAY = parseInt\('(\d+)'\)/)?.[1]);
  const hour = Number(html.match(/LIVE_START_HOUR = parseInt\('(\d+)'\)/)?.[1]);
  if (!day || Number.isNaN(hour)) throw new Error("예약 시작 시각을 찾지 못했습니다");
  return { day, hour };
}

const campOf = (camp: CampRef) => {
  const found = COMEALL_CAMPS.find((c) => c.slug === camp.slug);
  if (!found) throw new Error(`낙동강 캠핑장이 아닙니다: ${camp.slug}`);
  return found;
};

const pageOf = (camp: CampRef) => `${campOf(camp).origin}/reservation/real_time`;

const isMonthEnd = (date: string) => shiftISO(date, 1).endsWith("-01");

type Sheet = { sites: ComeallSite[]; live: { day: number; hour: number } };

function sheet(camp: CampRef, date: string, nights: number): Promise<Sheet> {
  return memo(`portal:${camp.id}:day:${date}:${nights}`, 2 * MINUTE, async () => {
    const url = `${pageOf(camp)}?resdate=${date}&schGugun=${nights}`;
    const res = await limit(() => fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" }));
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const html = await res.text();
    const sites = parseComeall(html);
    if (!sites.length) throw new Error("사이트 배치도를 찾지 못했습니다");
    return { sites, live: parseLiveStart(html) };
  });
}

/** 오늘 1박 배치도 — 구역·사이트 전부와 예약 시작 시각을 여기서 읽는다. */
const today = (camp: CampRef) => sheet(camp, todayISO(), 1);

/** 화면 스크립트의 최대 예약일: 예약 시작 시각이 지나면 다음 달 말일, 아니면 이번 달 말일. */
async function lastDay(camp: CampRef) {
  const { live } = await today(camp);
  const [year, month] = todayISO().split("-").map(Number);
  const [day, hour] = seoulDayHour();
  const opened = day > live.day || (day === live.day && hour >= live.hour);
  return new Date(Date.UTC(year, month - 1 + (opened ? 2 : 1), 0)).toISOString().slice(0, 10);
}

async function available(camp: CampRef, date: string, nights: number): Promise<ComeallSite[]> {
  if (nights > MAX_NIGHTS || (nights === 2 && isMonthEnd(date)) || date > (await lastDay(camp))) return [];
  return (await sheet(camp, date, nights)).sites.filter((site) => site.open);
}

export const comeall: CampProvider = {
  id: "comeall",
  cheapWindow: true,

  async listCamps(portal: Portal) {
    return COMEALL_CAMPS.map((c) => ({
      id: `${portal.id}:${c.slug}`,
      portalId: portal.id,
      slug: c.slug,
      name: c.name,
    }));
  },

  async bookingWindow(_portal, camp) {
    return { start: todayISO(), end: await lastDay(camp), maxStay: MAX_NIGHTS, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const all = (await today(camp)).sites;
    const open = await available(camp, date, nights);
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

  async roomDay(_portal, camp, zoneNo, date, nights) {
    const all = (await today(camp)).sites;
    const open = new Set((await available(camp, date, nights)).map((site) => site.id));
    const rooms: Room[] = all
      .filter((site) => site.zone === zoneNo)
      .map((site) => ({ no: site.id, zoneNo, name: site.name, amount: null, size: "" }));
    return { rooms, available: rooms.filter((room) => open.has(room.no)).map((room) => room.no) };
  },

  bookingTarget(_portal, camp, checkIn, nights) {
    return {
      url: pageOf(camp),
      method: "GET",
      fields: { resdate: checkIn, schGugun: String(Math.min(nights, MAX_NIGHTS)) },
    };
  },
};
