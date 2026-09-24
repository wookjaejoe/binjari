import { MINUTE, createLimiter, memo } from "@/lib/cache";
import { todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Room, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * `*.huyang.co.kr` 예약 화면. 옛 ASP 예약 화면(rsvasp.ts)을 만든 업체의 다음 세대로, 뼈대
 * (`reservation.asp?location=002`)는 같지만 달력에 사이트가 없다. 날짜 칸은 `open`/`close` 뿐이고,
 * 날짜를 누르면(`location=002_01`, POST) 그 일정에 예약할 수 있는 사이트와 요금이 나온다.
 * 그래서 사이트 수는 열린 날짜마다 따로 묻는다. 로그인 없이 온다(2026-09-25 실측).
 *
 * - 캠핑장은 `wloc`, 구역은 `man` 으로 갈린다(구역 탭이 없는 곳은 1 하나). 캠핑장 하나짜리 서버(하기숲)는
 *   `wloc` 이 없다.
 * - 여러 박은 포털이 직접 답한다 — 달력 위 "예약기간" 라디오가 `edd`(0=1박2일 … 3=4박5일)를 바꾼다.
 *   그보다 길면 없음이다.
 * - 날짜 목록 POST 는 달력 화면을 Referer 로 보내야 하고, 세션 쿠키를 같이 보낸다.
 * - 요금은 비수기 평일·주말·성수기 세 칸이 같이 나와 그 날이 어느 칸인지 포털이 말하지 않는다.
 *   고르지 않고 비워 둔다.
 */

type HuyangCamp = {
  slug: string;
  name: string;
  origin: string;
  /** 한 서버에 캠핑장이 여럿일 때만 있다(정선군시설관리공단). */
  wloc?: string;
  zones: { man: string; name: string }[];
};

export const HUYANG_CAMPS: HuyangCamp[] = [
  {
    slug: "donggang",
    name: "정선 동강전망자연휴양림 캠핑장",
    origin: "https://jsimc.huyang.co.kr:453",
    wloc: "C01",
    zones: [{ man: "1", name: "데크" }],
  },
  {
    slug: "hwaam",
    name: "정선 화암약수야영장",
    origin: "https://jsimc.huyang.co.kr:453",
    wloc: "A01",
    zones: [
      { man: "1", name: "데크A" },
      { man: "2", name: "데크B" },
      { man: "3", name: "숙박시설" },
    ],
  },
  {
    // 대전 유성구. 같은 화면을 자기 도메인(:454)에 올렸다. 캠핑장 하나라 wloc 이 없다.
    slug: "hagisup",
    name: "대전 하기숲 캠핑장",
    origin: "https://www.hgscamp.kr:454",
    zones: [{ man: "1", name: "전체" }],
  },
];

const MAX_NIGHTS = 4;
const MAX_MONTHS = 3;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/** 한 업체 서버에 캠핑장 여럿이 있다. 스캔 전체의 동시성과 따로 두 개로 묶는다. */
const limit = createLimiter(2);

const campOf = (camp: CampRef) => {
  const found = HUYANG_CAMPS.find((c) => c.slug === camp.slug);
  if (!found) throw new Error(`huyang 캠핑장이 아닙니다: ${camp.slug}`);
  return found;
};

const squash = (html: string) => html.replace(/\s+/g, " ");

/**
 * 달력 한 장 → 예약을 받는 날(open). 날짜는 칸 안 폼의 숨은 값(syyyy·smm·sdd)에서 읽는다 —
 * 칸에 날짜 글자를 따로 적는 곳(정선)과 버튼 글자로만 적는 곳(하기숲)이 있어서다.
 */
export function parseHuyangCalendar(html: string): { open: string[]; hasNext: boolean } {
  const page = squash(html);
  if (!/<li class="month">\d{4}년 \d{1,2}월<\/li>/.test(page)) throw new Error("예약 달력을 찾지 못했습니다");
  const open = [...page.matchAll(/<td class="open">(.*?)<\/td>/g)].flatMap(([, cell]) => {
    const value = (name: string) => cell.match(new RegExp(`name="${name}" value="(\\d+)"`))?.[1];
    const [y, m, d] = [value("syyyy"), value("smm"), value("sdd")];
    return y && m && d ? [`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`] : [];
  });
  return { open, hasNext: /name="form_next"/.test(page) };
}

/**
 * 날짜 목록 → 예약할 수 있는 사이트 이름. 줄마다 이름 칸 뒤에 요금 칸 몇 개와 예약 폼이 온다.
 * 하나도 없으면 목록 대신 "예약 가능한 시설이 없습니다" 경고만 온다 — 없음이다.
 */
export function parseHuyangDay(html: string): string[] {
  const page = squash(html);
  const table = page.match(/class="res_facility_list_t"(.*?)<\/table>/)?.[1];
  if (table == null) {
    if (page.includes("예약 가능한 시설이 없습니다")) return [];
    throw new Error("예약 가능 시설 목록을 찾지 못했습니다");
  }
  return [...table.matchAll(/<td>([^<]+)<\/td>(?:\s*<td>[\d,]+원<\/td>)+\s*<td><form/g)].map(([, name]) =>
    name.trim(),
  );
}

type Session = { cookie: string; referer: string };

function session(camp: CampRef): Promise<Session> {
  return memo(`portal:${camp.id}:session`, 5 * MINUTE, async () => {
    const { origin, wloc } = campOf(camp);
    const referer = `${origin}/reservation.asp?location=002${wloc ? `&wloc=${wloc}` : ""}`;
    const res = await limit(() => fetch(referer, { headers: { "User-Agent": UA }, cache: "no-store" }));
    if (!res.ok) throw new Error(`${referer} → HTTP ${res.status}`);
    const cookie = res.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    return { cookie, referer };
  });
}

async function post(camp: CampRef, location: string, fields: Record<string, string>) {
  const { origin, wloc } = campOf(camp);
  const { cookie, referer } = await session(camp);
  const url = `${origin}/reservation.asp?location=${location}`;
  const res = await limit(() =>
    fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: referer,
        ...(cookie && { Cookie: cookie }),
      },
      body: new URLSearchParams({ ...fields, ...(wloc && { wloc }) }),
      cache: "no-store",
    }),
  );
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/** 구역마다 예약을 받는 날. 이번 달부터 다음 달 버튼이 꺼질 때까지. */
function openDays(camp: CampRef): Promise<Record<string, Set<string>>> {
  return memo(`portal:${camp.id}:open`, 2 * MINUTE, async () => {
    const [year, m] = todayISO().split("-").map(Number);
    const byZone: Record<string, Set<string>> = {};
    for (const { man } of campOf(camp).zones) {
      byZone[man] = new Set();
      for (let i = 0; i < MAX_MONTHS; i += 1) {
        const y = year + Math.floor((m - 1 + i) / 12);
        const mm = ((m - 1 + i) % 12) + 1;
        const sheet = parseHuyangCalendar(
          await post(camp, "002", { wh_year: String(y), wh_month: String(mm), man }),
        );
        for (const date of sheet.open) byZone[man].add(date);
        if (!sheet.hasNext) break;
      }
    }
    return byZone;
  });
}

/** 그 일정에 예약할 수 있는 사이트. 첫 밤이 달력에서 닫혀 있으면 묻지 않는다. */
async function sitesFor(camp: CampRef, man: string, date: string, nights: number): Promise<string[]> {
  if (nights > MAX_NIGHTS) return [];
  const open = (await openDays(camp))[man];
  if (!open?.has(date)) return [];
  return memo(`portal:${camp.id}:day:${man}:${date}:${nights}`, 2 * MINUTE, async () => {
    const [y, m, d] = date.split("-").map(Number);
    const html = await post(camp, "002_01", {
      syyyy: String(y),
      smm: String(m),
      sdd: String(d),
      edd: String(nights - 1),
      man,
    });
    return parseHuyangDay(html);
  });
}

export const huyang: CampProvider = {
  id: "huyang",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return HUYANG_CAMPS.map((c) => ({
      id: `${portal.id}:${c.slug}`,
      portalId: portal.id,
      slug: c.slug,
      name: c.name,
    }));
  },

  async bookingWindow(_portal, camp) {
    const dates = [...new Set(Object.values(await openDays(camp)).flatMap((set) => [...set]))].sort();
    if (!dates.length) return null;
    return { start: dates[0], end: dates.at(-1)!, maxStay: MAX_NIGHTS, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const zones: Zone[] = campOf(camp).zones.map(({ man, name }, order) => ({
      no: man,
      name,
      total: 0,
      size: "",
      maxPeop: 0,
      order,
      photo: null,
      ground: "",
    }));
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    for (const zone of zones) {
      counts[zone.no] = (await sitesFor(camp, zone.no, date, nights)).length;
      amounts[zone.no] = null;
    }
    return { zones, counts, amounts } satisfies ZoneDay;
  },

  async roomDay(_portal, camp, zoneNo, date, nights) {
    const available = await sitesFor(camp, zoneNo, date, nights);
    const rooms: Room[] = available.map((name) => ({ no: `${zoneNo}:${name}`, zoneNo, name, amount: null, size: "" }));
    return { rooms, available: rooms.map((room) => room.no) };
  },

  bookingTarget(_portal, camp) {
    const { origin, wloc } = campOf(camp);
    return { url: `${origin}/reservation.asp`, method: "GET", fields: { location: "002", ...(wloc && { wloc }) } };
  },
};
