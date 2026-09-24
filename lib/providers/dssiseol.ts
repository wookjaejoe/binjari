import { MINUTE, createLimiter, memo } from "@/lib/cache";
import { shiftISO, todayISO } from "@/lib/date";
import type { CampProvider, CampRef, Portal, Room, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 달성군시설관리공단 통합예약(yeyak.dssiseol.or.kr) — 낙동강레포츠밸리 구지오토·강변오토캠핑장.
 *
 * 캠핑장 화면(`/index.do?menu_id=…`)에 예약할 수 있는 마지막 체크인 날(`maxStartDate`)과 구역
 * 셀렉트(`acmdt_fclt_clsf_id` — 구지는 캐라반 8인·6인, 강변은 사이트 하나)가 있다. 입·퇴실을 고르면
 * 화면이 `listAcmdtFcltRsvt.do`(POST)를 불러 그 일정에 예약할 수 있는 숙소만 준다. 로그인 없이
 * 온다(2026-09-25 실측). 여러 박도 같은 요청으로 포털이 답한다.
 *
 * 목록에는 빈 숙소만 있어 구역 정원은 모른다. 화면은 오늘 오후 8시가 지나면 오늘 체크인을 묻지
 * 않는다 — 같은 규칙을 따른다.
 */

const ORIGIN = "https://yeyak.dssiseol.or.kr";
const INST = "DSS_INST_00000016";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

export const DSS_CAMPS: { slug: string; name: string; path: string; menu: string; dclsf: string }[] = [
  { slug: "guji", name: "달성 구지오토캠핑장", path: "guji", menu: "00004985", dclsf: "DSS_0017_01" },
  { slug: "river", name: "달성 강변오토캠핑장", path: "river", menu: "00005190", dclsf: "DSS_0017_02" },
];

const limit = createLimiter(2);

const campOf = (camp: CampRef) => {
  const found = DSS_CAMPS.find((c) => c.slug === camp.slug);
  if (!found) throw new Error(`달성 캠핑장이 아닙니다: ${camp.slug}`);
  return found;
};

const pageUrl = (camp: CampRef) => `${ORIGIN}/index.do?menu_id=${campOf(camp).menu}`;

type Page = { cookie: string; lastCheckIn: string; zones: { id: string; name: string }[] };

export function parseDssPage(html: string): Omit<Page, "cookie"> {
  const page = html.replace(/\s+/g, " ");
  const lastCheckIn = page.match(/maxStartDate = new Date\('(\d{4}-\d{2}-\d{2})'\)/)?.[1];
  const select = page.match(/<select id="acmdt_fclt_clsf_id"[^>]*>(.*?)<\/select>/)?.[1] ?? "";
  const zones = [...select.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(([, id, name]) => ({
    id,
    name: name.trim(),
  }));
  if (!lastCheckIn || !zones.length) throw new Error("예약 화면에서 기간·구역을 찾지 못했습니다");
  return { lastCheckIn, zones };
}

function page(camp: CampRef): Promise<Page> {
  return memo(`portal:${camp.id}:page`, 10 * MINUTE, async () => {
    const res = await limit(() => fetch(pageUrl(camp), { headers: { "User-Agent": UA }, cache: "no-store" }));
    if (!res.ok) throw new Error(`${pageUrl(camp)} → HTTP ${res.status}`);
    const cookie = res.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    return { cookie, ...parseDssPage(await res.text()) };
  });
}

const seoulHour = () =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" }).format(new Date()));

/** 그 일정에 예약할 수 있는 숙소 이름. 화면이 받지 않는 일정이면 묻지 않는다. */
async function available(camp: CampRef, zoneId: string, date: string, nights: number): Promise<string[]> {
  const { cookie, lastCheckIn } = await page(camp);
  const today = todayISO();
  if (date < today || shiftISO(date, nights - 1) > lastCheckIn) return [];
  if (date === today && seoulHour() >= 20) return [];
  return memo(`portal:${camp.id}:list:${zoneId}:${date}:${nights}`, 2 * MINUTE, async () => {
    const { path, dclsf } = campOf(camp);
    const res = await limit(() =>
      fetch(`${ORIGIN}/dss/yeyak/acmdtFclt/camp/${path}/listAcmdtFcltRsvt.do`, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: pageUrl(camp),
          ...(cookie && { Cookie: cookie }),
        },
        body: new URLSearchParams({
          inst_id: INST,
          acmdt_fclt_clsf_dcd: "DSS_0014_01",
          acmdt_fclt_dclsf_dcd: dclsf,
          acmdt_fclt_clsf_id: zoneId,
          rsvt_bgng_ymd: date,
          rsvt_end_ymd: shiftISO(date, nights),
        }),
        cache: "no-store",
      }),
    );
    if (!res.ok) throw new Error(`달성 ${date} → HTTP ${res.status}`);
    const list = (await res.json()) as { acmdt_fclt_nm: string }[];
    return list.map((unit) => unit.acmdt_fclt_nm.trim());
  });
}

export const dssiseol: CampProvider = {
  id: "dssiseol",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return DSS_CAMPS.map((c) => ({
      id: `${portal.id}:${c.slug}`,
      portalId: portal.id,
      slug: c.slug,
      name: c.name,
    }));
  },

  async bookingWindow(_portal, camp) {
    const { lastCheckIn } = await page(camp);
    return { start: todayISO(), end: lastCheckIn, maxStay: null, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const { zones } = await page(camp);
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};
    const list: Zone[] = [];
    for (const [order, { id, name }] of zones.entries()) {
      counts[id] = (await available(camp, id, date, nights)).length;
      amounts[id] = null;
      list.push({
        no: id,
        name,
        total: 0,
        unit: /캐라반|카라반/.test(name) ? "대" : undefined,
        size: "",
        maxPeop: 0,
        order,
        photo: null,
        ground: "",
      });
    }
    return { zones: list, counts, amounts } satisfies ZoneDay;
  },

  async roomDay(_portal, camp, zoneNo, date, nights) {
    const names = await available(camp, zoneNo, date, nights);
    const rooms: Room[] = names.map((name) => ({ no: `${zoneNo}:${name}`, zoneNo, name, amount: null, size: "" }));
    return { rooms, available: rooms.map((room) => room.no) };
  },

  bookingTarget(_portal, camp) {
    return { url: `${ORIGIN}/index.do`, method: "GET", fields: { menu_id: campOf(camp).menu } };
  },
};
