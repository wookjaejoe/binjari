import { HOUR, MINUTE, createLimiter, memo } from "@/lib/cache";
import { compactToISO, isoToCompact, shiftISO } from "@/lib/date";
import type {
  BookingWindow,
  CampProvider,
  CampRef,
  Portal,
  Room,
  Zone,
  ZoneDay,
} from "@/lib/providers/types";

/**
 * Xticket(유포러스) 캠핑 예약. 여러 지자체·공공 캠핑장이 같은 도메인(camp.xticket.kr)과 같은
 * 화면을 쓰고, 캠핑장은 `shopEncode` 로만 갈린다. 목록을 주는 곳이 없어 캠핑장을 여기 적는다.
 *
 * 순서(2026-09-24 실측, 로그인·캡차 없음 — 캡차는 예약 제출에만 있다)
 * 1. GET /web/main?shopEncode=… → /Web/Reservation 을 한 번 돌아오며 세션 쿠키에 캠핑장이 묶인다.
 * 2. POST /Web/Book/GetShopInformation.json — 최대 박수(book_days), 첫 달(play_month)
 * 3. POST GetBookPlayDate.json(play_month) — 예약을 받는 날과 그 날의 남은 수(book_remain_count)
 * 4. POST GetBookProductGroup.json — 구역(1야영장·글램핑…)
 * 5. POST GetBookProduct010001.json — 구역의 사이트 한 칸씩. status_code 0 + select_yn 1 만 예약가능
 *
 * POST 는 Origin 헤더가 없으면 빈 `{}` 를 준다(같은 출처 확인). 브라우저가 보내는 값 그대로 보낸다.
 */

const ORIGIN = "https://camp.xticket.kr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/**
 * 캠핑장 목록. slug 는 우리 쪽 짧은 이름이고 encode 가 포털의 열쇠다. 숙박이 아닌 상품(축구장
 * 같은 대관)을 같이 파는 곳은 skip 에 구역 이름을 적어 뺀다.
 *
 * 고캠핑이 Xticket 으로 잇는 칠곡보 오토캠핑장(3b8dfd4f…)과 양주 미술관옆 캠핑장(aa49da0f…)은
 * 예약 화면으로 넘어가는 순간 `/web/error.html?code=9001`("잘못된 접근입니다")로 튕긴다
 * (2026-09-25). 같은 순서로 다른 곳은 열리니 캠핑장 쪽 사정이다 — 넣지 않았다.
 */
export const XTICKET_SHOPS: { slug: string; name: string; encode: string; skip?: string[] }[] = [
  {
    slug: "seoulgrandpark",
    name: "서울대공원캠핑장",
    encode: "b4326b91b88249effc628d1b4cc714d2dec58eb3de89146841929db714ee7058",
  },
  {
    slug: "gangdong-greenway",
    name: "그린웨이가족캠핑장",
    encode: "5f9422e223671b122a7f2c94f4e15c6f71cd1a49141314cf19adccb98162b5b0",
  },
  {
    slug: "uidong",
    name: "우이동가족캠핑장",
    encode: "13896b8dd3600159017b0e96c5bd5be7df3236beaa12b8fdb7aa462bab916b2f",
  },
  {
    slug: "dalseo-byeolbit",
    name: "달서별빛캠프",
    encode: "f27ad3485cf140b64341e2cc975c376d14561a12aca07349ae393d97379882c7",
  },
  {
    slug: "saengrim",
    name: "생림오토캠핑장",
    encode: "f5f32b56abe23f9aec682e337c7ee65772a4438ff09b56823d4c7d2a7528d940",
  },
  {
    slug: "seungchon",
    name: "승촌공원 캠핑장",
    encode: "a1535c44b7b5b3ab38fd902f0c58f8600f1a57e45999ac4b1a7b8c321f1d2df5",
    skip: ["축구장"],
  },
  {
    slug: "najeong",
    name: "경주 나정고운모래해변 오토캠핑장",
    encode: "08f2d6ac872d55a829cd62de5a910ff0922eeb57506d4ddbe021224fce47d006",
  },
  {
    slug: "pyeongsari",
    name: "하동 평사리공원 야영장",
    encode: "9a70806d9ece939f91136278845d34c118219969c03be87baf58f1c3f6733b31",
  },
  {
    slug: "gyeongju-oryu",
    name: "경주 오류캠핑장",
    encode: "1d452e80e849139a2c76ff348c1b3f1d5a491d6af95823ad850515d67901dd92",
  },
  {
    // 고캠핑 링크에는 shopEncode 가 없다. 함안군 관광 안내 페이지의 예약 링크에서 찾았다.
    slug: "haman-gangnaru",
    name: "함안 강나루오토캠핑장",
    encode: "0ca2dbc468034c0554a59d50a00e1fa0d273547243cd913e8ffc7fe403c13729",
  },
];

const encodeOf = (camp: CampRef) => {
  const shop = XTICKET_SHOPS.find((s) => s.slug === camp.slug);
  if (!shop) throw new Error(`Xticket 캠핑장이 아닙니다: ${camp.slug}`);
  return shop.encode;
};

/** 작은 업체 서버다. 스캔 전체의 동시성(8)과 따로, 여기서 두 개로 묶는다. */
const limit = createLimiter(2);

type Json = Record<string, unknown>;

/** 리다이렉트를 따라가며 쿠키를 모은다. fetch 에는 쿠키 저장소가 없다. */
async function openSession(encode: string): Promise<string> {
  const jar = new Map<string, string>();
  let url = `${ORIGIN}/web/main?shopEncode=${encode}`;
  for (let hop = 0; hop < 5; hop += 1) {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
      redirect: "manual",
      cache: "no-store",
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const at = pair.indexOf("=");
      jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      if (next.includes("error")) throw new Error(`Xticket 이 캠핑장을 받지 않습니다(${next})`);
      url = new URL(next, url).href;
      continue;
    }
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    break;
  }
  if (!jar.size) throw new Error("Xticket 세션을 열지 못했습니다");
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

const session = (encode: string) => memo(`xticket:session:${encode}`, 10 * MINUTE, () => openSession(encode));

async function post(encode: string, path: string, body: Record<string, string | number>) {
  const call = async (cookie: string) => {
    const res = await fetch(`${ORIGIN}/Web/Book/${path}`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Cookie: cookie,
        Origin: ORIGIN,
        Referer: `${ORIGIN}/web/main?shopEncode=${encode}`,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return (await res.json()) as Json;
  };
  return limit(async () => {
    const first = await call(await session(encode));
    if (first.data) return first.data as Json;
    // 세션이 끊기면 빈 {} 가 온다. 한 번만 새로 열어 다시 묻는다.
    const fresh = await openSession(encode);
    const second = await call(fresh);
    if (!second.data) throw new Error(`${path} 응답이 비어 있습니다`);
    return second.data as Json;
  });
}

type Day = { date: string; remain: number };
type Shop = { maxStay: number; twoStay: number; days: Day[] };

const nextMonth = (month: string) => {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(4, 6));
  return m === 12 ? `${year + 1}01` : `${year}${String(m + 1).padStart(2, "0")}`;
};

/**
 * 예약을 받는 날. 포털 달력은 첫 달과 다음 달을 이어 부른다. 빈 달이 나올 때까지 세 달까지 묻는다.
 * `advance_yn=1` 인 날은 관내 주민 우선예약 기간이라 일반 예약이 아직 안 된다 — 넣지 않는다.
 */
function shop(camp: CampRef): Promise<Shop> {
  const encode = encodeOf(camp);
  return memo(`portal:${camp.id}:shop`, 2 * MINUTE, async () => {
    // 응답의 data 가 곧 캠핑장 정보다(shop_name, book_days, play_month …).
    const info = await post(encode, "GetShopInformation.json", { shop_encode: encode });
    const days: Day[] = [];
    let month = String(info.play_month ?? "");
    for (let i = 0; month && i < 3; i += 1, month = nextMonth(month)) {
      const list = ((await post(encode, "GetBookPlayDate.json", { play_month: month }))
        .bookPlayDateList ?? []) as Json[];
      if (!list.length && i > 0) break;
      for (const day of list) {
        if (day.advance_yn === "1") continue;
        days.push({ date: compactToISO(String(day.play_date)), remain: Number(day.book_remain_count ?? 0) });
      }
    }
    if (!days.length) throw new Error("예약 받는 날을 찾지 못했습니다");
    return {
      maxStay: Number(info.book_days ?? 1) || 1,
      twoStay: Number(info.two_stay_days ?? 0) || 0,
      days: days.sort((a, b) => a.date.localeCompare(b.date)),
    };
  });
}

type Group = { code: string; name: string; fee: number | null };

function groups(camp: CampRef, days: Day[]): Promise<Group[]> {
  const encode = encodeOf(camp);
  return memo(`xticket:groups:${camp.slug}`, HOUR, async () => {
    const list = ((await post(encode, "GetBookProductGroup.json", {
      start_date: isoToCompact(days[0].date),
      end_date: isoToCompact(days.at(-1)!.date),
    })).bookProductGroupList ?? []) as Json[];
    const skip = XTICKET_SHOPS.find((s) => s.slug === camp.slug)?.skip ?? [];
    return list
      .map((g) => ({
        code: String(g.product_group_code),
        name: String(g.product_group_name).trim(),
        fee: g.product_fee == null ? null : Number(g.product_fee),
      }))
      .filter((g) => !skip.includes(g.name));
  });
}

type Site = { no: string; name: string; open: boolean; amount: number };

function sites(camp: CampRef, group: string, date: string, nights: number, twoStay: number) {
  const encode = encodeOf(camp);
  return memo(`portal:${camp.id}:sites:${group}:${date}:${nights}`, 2 * MINUTE, async () => {
    const list = ((await post(encode, "GetBookProduct010001.json", {
      product_group_code: group,
      start_date: isoToCompact(date),
      end_date: isoToCompact(shiftISO(date, nights - 1)),
      book_days: nights,
      two_stay_days: twoStay,
    })).bookProductList ?? []) as Json[];
    return list.map(
      (p): Site => ({
        no: `${group}:${p.product_code}`,
        name: String(p.product_name ?? "").trim(),
        open: p.status_code === "0" && p.select_yn === "1",
        amount: Number(p.sale_product_fee ?? p.product_fee ?? 0),
      }),
    );
  });
}

export const xticket: CampProvider = {
  id: "xticket",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return XTICKET_SHOPS.map((s) => ({
      id: `${portal.id}:${s.slug}`,
      portalId: portal.id,
      slug: s.slug,
      name: s.name,
    }));
  },

  async bookingWindow(_portal, camp) {
    const { days, maxStay } = await shop(camp);
    return { start: days[0].date, end: days.at(-1)!.date, maxStay, minStay: null } satisfies BookingWindow;
  },

  async zoneDay(_portal, camp, date, nights) {
    const info = await shop(camp);
    const list = await groups(camp, info.days);
    const day = info.days.find((d) => d.date === date);
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};

    const zones: Zone[] = await Promise.all(
      list.map(async (group, order) => {
        // 예약을 받지 않는 날, 최대 박수를 넘는 일정, 그 날 남은 수가 0 인 날은 사이트를 묻지 않는다.
        // 마지막은 포털이 날짜 단위로 이미 0 이라고 답한 것이다(구역을 나눠 물어도 0 이다).
        const ask = day && day.remain > 0 && nights <= info.maxStay;
        const open = ask
          ? (await sites(camp, group.code, date, nights, info.twoStay)).filter((s) => s.open)
          : [];
        counts[group.code] = open.length;
        amounts[group.code] = open.length ? Math.min(...open.map((s) => s.amount)) : null;
        return {
          no: group.code,
          name: group.name,
          total: 0,
          size: "",
          maxPeop: 0,
          order,
          photo: null,
          ground: "",
        };
      }),
    );
    return { zones, counts, amounts } satisfies ZoneDay;
  },

  async roomDay(_portal, camp, zoneNo, date, nights) {
    const info = await shop(camp);
    const day = info.days.find((d) => d.date === date);
    // 구역 조회와 같은 이유로 묻지 않는다. 객실 목록은 다른 날짜의 응답에서 모인다.
    if (!day || day.remain === 0 || nights > info.maxStay) return { rooms: [], available: [] };
    const list = await sites(camp, zoneNo, date, nights, info.twoStay);
    const rooms: Room[] = list.map((s) => ({
      no: s.no,
      zoneNo,
      name: s.name,
      amount: s.amount || null,
      size: "",
    }));
    return { rooms, available: list.filter((s) => s.open).map((s) => s.no) };
  },

  bookingTarget(_portal, camp) {
    return { url: `${ORIGIN}/web/main`, method: "GET", fields: { shopEncode: encodeOf(camp) } };
  },
};
