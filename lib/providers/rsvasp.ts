import { MINUTE, memo } from "@/lib/cache";
import { shiftISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Room, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 한 업체가 여러 지자체 캠핑장에 깔아 준 옛 ASP 예약 화면(`reservation.asp?location=002`).
 * 캠핑장마다 도메인·포트가 다르고(:453, :456) 화면 모양도 조금씩 다르지만 뼈대가 같다.
 *
 * 달력 한 장(구역 × 달)에 날짜마다 그 구역의 사이트가 전부 적혀 있다 — 예약할 수 있는 것은
 * `alt="예약가능"` 버튼, 끝난 것은 `alt="예약완료"` 그림. 예약을 받지 않는 날은 사이트 없이
 * `예약종료` 만 있다. 로그인 없이 온다(2026-09-25 실측). 구역은 `man` 값으로 갈린다.
 *
 * 달력은 1박 기준이다. 여러 박은 같은 사이트가 이어진 밤마다 비어 있는지로 읽는다. 포털의
 * 여러 박 검색(`location=002_01`, edd=1)이 준 목록과 달력에서 이틀 다 빈 사이트가 똑같았다
 * (상소 A구역 9/28–9/30, 15곳 = 15곳). 포털의 빠른 검색이 3박4일까지만 주므로 그보다 길면 없음이다.
 *
 * 같은 업체의 다른 세대(jsimc.huyang.co.kr 화암약수, byeonsan.huyang.co.kr 변산해수욕장)는
 * 달력에 사이트 없이 예약가능/예약종료만 있어 날짜마다 따로 물어야 한다 — 아직 붙이지 않았다.
 */

type AspCamp = {
  slug: string;
  name: string;
  origin: string;
  /** 달력 폼에 같이 보내야 하는 값. 지경은 해변 구역을 `whorun` 으로 가른다. */
  extra?: Record<string, string>;
};

export const RSVASP_CAMPS: AspCamp[] = [
  {
    slug: "jigyeong",
    name: "양양 지경 국민여가캠핑장",
    origin: "https://www.jgcamp.kr:456",
    // 해변데크·솔밭데크·해당화펜션·글램핑하우스는 마을회가 따로 운영하는 whorun=beach 화면이다.
    extra: { whorun: "" },
  },
  {
    slug: "sangso",
    name: "대전 상소오토캠핑장",
    origin: "https://www.sangsocamping.kr:453",
  },
];

const MAX_NIGHTS = 3;
const MAX_MONTHS = 3;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const campOf = (camp: CampRef) => {
  const found = RSVASP_CAMPS.find((c) => c.slug === camp.slug);
  if (!found) throw new Error(`ASP 달력 캠핑장이 아닙니다: ${camp.slug}`);
  return found;
};

const squash = (html: string) => html.replace(/\s+/g, " ");
const strip = (html: string) =>
  html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();

/** 구역 목록. 셀렉트(`<select name="man">`)로 주는 곳과 탭 버튼 폼으로 주는 곳이 있다. */
export function parseZones(html: string): { man: string; name: string }[] {
  const page = squash(html);
  const select = page.match(/<select name="man"[^>]*>(.*?)<\/select>/)?.[1];
  if (select) {
    return [...select.matchAll(/<option value="(\d+)"[^>]*>(.*?)<\/option>/g)].map(([, man, name]) => ({
      man,
      name: strip(name),
    }));
  }
  const tabs = [
    ...page.matchAll(/value="(\d+)" name="man" \/>(?:<input[^>]*>)*\s*<button[^>]*>([^<]+)<\/button>/g),
  ];
  return tabs.map(([, man, name]) => ({ man, name: name.trim() }));
}

export type AspMonth = {
  /** "2026-09" */
  month: string;
  /** 예약을 받는 날 → 사이트 이름 → 비었는가 */
  days: Record<string, Record<string, boolean>>;
  hasNext: boolean;
};

/** 달력 한 장. 달은 표 바로 앞의 "2026년 9월" 에서 읽는다. */
export function parseCalendar(html: string): AspMonth {
  const page = squash(html);
  const start = page.indexOf("<table");
  const heads = [...page.slice(0, start).matchAll(/(\d{4})년\s*(\d{1,2})월/g)];
  const head = heads.at(-1);
  if (start < 0 || !head) throw new Error("예약 달력을 찾지 못했습니다");
  const month = `${head[1]}-${head[2].padStart(2, "0")}`;
  const table = page.slice(start, page.indexOf("</table>", start));

  const days: AspMonth["days"] = {};
  for (const [, body] of table.matchAll(/<td[^>]*>(.*?)<\/td>(?=\s*(?:<td|<\/tr>))/g)) {
    const day = strip(body).match(/^(\d{1,2})/)?.[1];
    if (!day) continue;
    const sites: Record<string, boolean> = {};
    for (const [, state, name] of body.matchAll(/alt="(예약가능|예약완료)"\s*\/?>\s*([^<]+)/g)) {
      sites[name.replace(/\*/g, "").trim()] = state === "예약가능";
    }
    // 사이트가 하나도 없으면(예약종료) 예약을 받지 않는 날이다.
    if (Object.keys(sites).length) days[`${month}-${day.padStart(2, "0")}`] = sites;
  }
  return { month, days, hasNext: /name="form_next"/.test(page) };
}

async function decode(res: Response) {
  // 옛 IIS 화면이라 EUC-KR 이다. 헤더에 charset 이 없다.
  return new TextDecoder("euc-kr").decode(await res.arrayBuffer());
}

type Calendar = {
  zones: { man: string; name: string }[];
  /** man → 날짜 → 사이트 → 비었는가 */
  byZone: Record<string, Record<string, Record<string, boolean>>>;
};

/** 구역 × 달을 차례로 받는다. 첫 GET 이 세션 쿠키를 준다. */
function calendar(camp: CampRef): Promise<Calendar> {
  return memo(`portal:${camp.id}:calendar`, 2 * MINUTE, async () => {
    const { origin, extra } = campOf(camp);
    const url = `${origin}/reservation.asp?location=002`;
    const first = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!first.ok) throw new Error(`${url} → HTTP ${first.status}`);
    const cookie = first.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    const html = await decode(first);
    const zones = parseZones(html);
    if (!zones.length) throw new Error("구역을 찾지 못했습니다");

    const page = async (man: string, month: string) => {
      const [year, mm] = month.split("-");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: url,
          ...(cookie && { Cookie: cookie }),
        },
        body: new URLSearchParams({ wh_year: year, wh_month: String(Number(mm)), man, ...extra }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${url} (${month}, man=${man}) → HTTP ${res.status}`);
      return parseCalendar(await decode(res));
    };

    const opening = parseCalendar(html);
    const byZone: Calendar["byZone"] = {};
    for (const { man } of zones) {
      byZone[man] = {};
      let month = opening.month;
      for (let i = 0; i < MAX_MONTHS; i += 1) {
        // 첫 화면은 첫 구역의 이번 달이다. 그건 다시 묻지 않는다.
        const sheet = i === 0 && man === zones[0].man ? opening : await page(man, month);
        Object.assign(byZone[man], sheet.days);
        if (!sheet.hasNext) break;
        const [y, m] = month.split("-").map(Number);
        month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      }
    }
    if (!Object.values(byZone).some((days) => Object.keys(days).length)) {
      throw new Error("예약 받는 날을 찾지 못했습니다");
    }
    return { zones, byZone };
  });
}

/** 구역의 사이트 이름 전부. 기간 중 한 번이라도 달력에 나온 것. */
const sitesOf = (days: Record<string, Record<string, boolean>>) =>
  [...new Set(Object.values(days).flatMap((sites) => Object.keys(sites)))].sort((a, b) =>
    a.localeCompare(b, "ko", { numeric: true }),
  );

/** date 부터 nights 밤 내내 빈 사이트. 한 밤이라도 예약을 받지 않으면 없다. */
export function openFor(
  days: Record<string, Record<string, boolean>>,
  date: string,
  nights: number,
): string[] {
  if (nights > MAX_NIGHTS) return [];
  const nightsOf = Array.from({ length: nights }, (_, i) => days[shiftISO(date, i)]);
  if (nightsOf.some((night) => !night)) return [];
  return Object.keys(nightsOf[0]).filter((site) => nightsOf.every((night) => night[site]));
}

function zonesOf(cal: Calendar): Zone[] {
  return cal.zones.map(({ man, name }, order) => ({
    no: man,
    name,
    total: sitesOf(cal.byZone[man] ?? {}).length,
    unit: /캐라반|카라반/.test(name) ? "대" : undefined,
    size: "",
    maxPeop: 0,
    order,
    photo: null,
    ground: "",
  }));
}

export const rsvasp: CampProvider = {
  id: "rsvasp",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return RSVASP_CAMPS.map((c) => ({
      id: `${portal.id}:${c.slug}`,
      portalId: portal.id,
      slug: c.slug,
      name: c.name,
    }));
  },

  async bookingWindow(_portal, camp) {
    const { byZone } = await calendar(camp);
    const dates = [...new Set(Object.values(byZone).flatMap((days) => Object.keys(days)))].sort();
    return { start: dates[0], end: dates.at(-1)!, maxStay: MAX_NIGHTS, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const cal = await calendar(camp);
    const zones = zonesOf(cal);
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    for (const zone of zones) {
      counts[zone.no] = openFor(cal.byZone[zone.no] ?? {}, date, nights).length;
      // 달력에는 요금이 없다.
      amounts[zone.no] = null;
    }
    return { zones, counts, amounts } satisfies ZoneDay;
  },

  async roomDay(_portal, camp, zoneNo, date, nights) {
    const days = (await calendar(camp)).byZone[zoneNo] ?? {};
    const rooms: Room[] = sitesOf(days).map((name) => ({
      no: name,
      zoneNo,
      name,
      amount: null,
      size: "",
    }));
    return { rooms, available: openFor(days, date, nights) };
  },

  bookingTarget(_portal, camp) {
    return { url: `${campOf(camp).origin}/reservation.asp`, method: "GET", fields: { location: "002" } };
  },
};
