import { HOUR, memo } from "@/lib/cache";
import { compactToISO, isoToCompact, shiftISO, todayISO } from "@/lib/date";
import type {
  BookingTarget,
  BookingWindow,
  CampProvider,
  CampRef,
  Portal,
  Room,
  RoomDay,
  Zone,
  ZoneDay,
} from "@/lib/providers/types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36";

type Json = Record<string, unknown>;

function campBase(portal: Portal, camp: CampRef) {
  return `https://${portal.host}/@${camp.slug}`;
}

async function postJson(url: string, body: Record<string, string | number>) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams(
      Object.entries(body).map(([k, v]) => [k, String(v)]),
    ).toString(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as Json;
}

async function getText(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/** 예약 API가 요구하는 내부 캠핑장 번호. 캠핑장 첫 페이지에만 노출된다. */
function campNo(portal: Portal, camp: CampRef): Promise<string> {
  return memo(
    `pubcamping:campNo:${portal.host}:${camp.slug}`,
    12 * HOUR,
    async () => {
      const html = await getText(`${campBase(portal, camp)}/index`);
      const found = html.match(/campSeach\.params\.campNo\s*=\s*"(\d+)"/);
      if (!found) throw new Error(`campNo를 찾지 못했습니다: ${camp.slug}`);
      return found[1];
    },
  );
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

export const pubcamping: CampProvider = {
  id: "pubcamping",

  async listCamps(portal) {
    return memo(`pubcamping:camps:${portal.host}`, HOUR, async () => {
      const checkIn = isoToCompact(shiftISO(todayISO(), 1));
      const html = await getText(
        `https://${portal.host}/productSearchListHtml.do` +
          `?stay_cnt=1&check_in=${checkIn}&camp_no=&option_type_04=&option_type_05=`,
      );
      const pattern =
        /<p class="title">([^<]+)<\/p>\s*<a href="\/@([A-Za-z0-9_-]+)\/index"/g;
      const camps: CampRef[] = [];
      const seen = new Set<string>();
      for (const m of html.matchAll(pattern)) {
        const slug = m[2];
        if (seen.has(slug)) continue;
        seen.add(slug);
        camps.push({
          id: `${portal.id}:${slug}`,
          portalId: portal.id,
          slug,
          name: m[1].trim(),
        });
      }
      return camps;
    });
  },

  async bookingWindow(portal, camp) {
    const res = await memo(
      `pubcamping:window:${portal.host}:${camp.slug}`,
      10 * 60_000,
      () => postJson(`${campBase(portal, camp)}/campInfoJson.do`, {}),
    );
    const data = res.RESULT_DATA as Json | undefined;
    if (res.RESULT_CODE !== "SUCCESS" || !data?.room_start_day) return null;
    return {
      start: compactToISO(str(data.room_start_day)),
      end: compactToISO(str(data.room_end_day)),
      maxStay: num(data.max_stay_limit) || null,
      minStay: num(data.min_stay_limit) || null,
    } satisfies BookingWindow;
  },

  async zoneDay(portal, camp, date, nights) {
    const res = await postJson(
      `${campBase(portal, camp)}/productSearchJson.do`,
      {
        stay_cnt: nights,
        check_in: isoToCompact(date),
        camp_no: await campNo(portal, camp),
      },
    );
    if (res.RESULT_CODE !== "SUCCESS") return null;

    const zones: Zone[] = [];
    const counts: Record<string, number> = {};
    const amounts: Record<string, number | null> = {};

    for (const raw of (res.RESULT_DATA ?? []) as Json[]) {
      const no = str(raw.ROOM_AREA_NO);
      // MASTER_IMAGE 는 "/2024/0404/….jpg" 꼴의 경로다. upload/cont 가 본문용 크기이고,
      // 더 작은 썸네일이 필요하면 next/image 가 이걸 줄인다.
      const image = str(raw.MASTER_IMAGE);
      zones.push({
        no,
        name: str(raw.ROOM_AREA_NAME),
        total: num(raw.TOT_ROOM_CNT),
        size: str(raw.SIZES),
        maxPeop: num(raw.MAX_PEOP_CNT),
        order: num(raw.ORDER_LEVEL),
        photo: image ? `https://${portal.host}/upload/cont${image}` : null,
        ground: str(raw.GROUNDS),
      });
      counts[no] = num(raw.ROOM_CNT);
      amounts[no] = raw.MIN_USE_AMT == null ? null : num(raw.MIN_USE_AMT);
    }
    return { zones, counts, amounts } satisfies ZoneDay;
  },

  async roomDay(portal, camp, zoneNo, date, nights) {
    const res = await postJson(
      `${campBase(portal, camp)}/productSelectJson.do`,
      {
        stay_cnt: nights,
        check_in: isoToCompact(date),
        check_out: isoToCompact(shiftISO(date, nights)),
        room_area_no: zoneNo,
      },
    );
    if (res.RESULT_CODE !== "SUCCESS") return null;

    const rooms: Room[] = [];
    const available: string[] = [];
    for (const raw of (res.RESULT_DATA ?? []) as Json[]) {
      const no = str(raw.ROOM_NO);
      rooms.push({
        no,
        zoneNo,
        name: str(raw.ROOM_NAME),
        amount: num(raw.AMOUNT),
        size: str(raw.ROOM_SIZE),
      });
      if (num(raw.STAY_CNT) >= nights) available.push(no);
    }
    return { rooms, available } satisfies RoomDay;
  },

  bookingTarget(portal, camp, checkIn, nights) {
    return {
      url: `${campBase(portal, camp)}/index?#sub-wrap`,
      method: "POST",
      fields: {
        check_in: isoToCompact(checkIn),
        check_out: isoToCompact(shiftISO(checkIn, nights)),
        stay_cnt: String(nights),
      },
    } satisfies BookingTarget;
  },
};
