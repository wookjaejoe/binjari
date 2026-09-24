import { MINUTE, createLimiter, invalidate, memo } from "@/lib/cache";
import { enumerateDates, todayISO } from "@/lib/date";
import { resolveCamp } from "@/lib/registry";
import type {
  BookingWindow,
  CampProfile,
  Room,
  RoomScan,
  Zone,
  ZoneScan,
} from "@/lib/types";

const SCAN_TTL = 3 * MINUTE;
const CONCURRENCY = 8;

/**
 * 물어볼 체크인 날짜. 오늘 이전만 달력 상식으로 빼고 예약 기간 끝까지 전부 묻는다.
 * 숙박일수로 끝을 당기지 않는다 — 기간을 넘기는 일정은 포털이 0 으로 답한다.
 */
export function checkInDates(window: BookingWindow): string[] {
  const start = todayISO() > window.start ? todayISO() : window.start;
  if (window.end < start) return [];
  return enumerateDates(start, window.end);
}

export function scanZones(campId: string, nights: number): Promise<ZoneScan> {
  return memo(`scan:zones:${campId}:${nights}`, SCAN_TTL, async () => {
    const { camp, portal, provider } = await resolveCamp(campId);
    const window = await provider.bookingWindow(portal, camp);
    const base = {
      campId,
      campName: camp.name,
      nights,
      window,
      generatedAt: new Date().toISOString(),
    };

    if (!window) {
      return { ...base, dates: [], zones: [], counts: {}, amounts: {}, failedDates: [] };
    }

    const dates = checkInDates(window);
    const limit = createLimiter(CONCURRENCY);
    const results = await Promise.all(
      dates.map((date) =>
        limit(async () => {
          try {
            return { date, day: await provider.zoneDay(portal, camp, date, nights) };
          } catch {
            return { date, day: null };
          }
        }),
      ),
    );

    const zones = new Map<string, Zone>();
    const counts: Record<string, Record<string, number>> = {};
    const amounts: Record<string, Record<string, number | null>> = {};
    const failedDates: string[] = [];

    for (const { date, day } of results) {
      if (!day) {
        failedDates.push(date);
        continue;
      }
      for (const zone of day.zones) {
        if (!zones.has(zone.no)) zones.set(zone.no, zone);
      }
      counts[date] = day.counts;
      amounts[date] = day.amounts;
    }

    return {
      ...base,
      dates,
      zones: [...zones.values()].sort((a, b) => a.order - b.order),
      counts,
      amounts,
      failedDates,
    };
  });
}

/**
 * 객실 단위 가용성. 요청된 존 × 모든 날짜를 묻는다. 구역 잔여가 0 인 날을
 * 건너뛰지 않는다 — 그건 앱이 포털 대신 답을 정하는 일이다.
 * `zoneFilter` 가 비어 있으면 구역 스캔에서 본 존 전부.
 */
export function scanRooms(
  campId: string,
  nights: number,
  zoneFilter?: string[],
): Promise<RoomScan> {
  const key = zoneFilter?.length ? [...zoneFilter].sort().join(",") : "all";
  return memo(`scan:rooms:${campId}:${nights}:${key}`, SCAN_TTL, async () => {
    const { camp, portal, provider } = await resolveCamp(campId);
    const zoneScan = await scanZones(campId, nights);
    const wanted = zoneFilter?.length
      ? zoneFilter
      : zoneScan.zones.map((zone) => zone.no);

    const tasks: { date: string; zoneNo: string }[] = [];
    for (const date of zoneScan.dates) {
      for (const zoneNo of wanted) tasks.push({ date, zoneNo });
    }

    const limit = createLimiter(CONCURRENCY);
    const results = await Promise.all(
      tasks.map(({ date, zoneNo }) =>
        limit(async () => {
          try {
            return { date, zoneNo, day: await provider.roomDay(portal, camp, zoneNo, date, nights) };
          } catch {
            return { date, zoneNo, day: null };
          }
        }),
      ),
    );

    const rooms = new Map<string, Room>();
    const available: Record<string, string[]> = {};
    const failed: Record<string, string[]> = {};

    for (const { date, zoneNo, day } of results) {
      if (!day) {
        failed[zoneNo] = [...(failed[zoneNo] ?? []), date];
        continue;
      }
      for (const room of day.rooms) if (!rooms.has(room.no)) rooms.set(room.no, room);
      available[date] = [...(available[date] ?? []), ...day.available];
    }

    return {
      campId,
      nights,
      rooms: [...rooms.values()].sort((a, b) => a.name.localeCompare(b.name, "ko")),
      available,
      failed,
      generatedAt: new Date().toISOString(),
    };
  });
}

/** 캠핑장 한 곳의 표시 정보. 포털에 예약 기간만 묻고, 못 얻으면 사유를 그대로 싣는다. */
export function campProfile(campId: string): Promise<CampProfile> {
  return memo(`profile:${campId}`, 10 * MINUTE, async () => {
    const { camp, portal, provider } = await resolveCamp(campId);
    const base = {
      id: campId,
      name: camp.name,
      portalId: portal.id,
      portalLabel: portal.label,
    };
    if (!provider.cheapWindow) return base;

    let window: BookingWindow | null;
    try {
      window = await provider.bookingWindow(portal, camp);
    } catch (error) {
      return {
        ...base,
        window: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    // 응답은 받았는데 기간 필드가 없는 것은 실패가 아니다. error 없이 window 만 null.
    return { ...base, window };
  });
}

/** 스캔 결과와, 어댑터가 `portal:<campId>` 로 캐시해 둔 원본(국립공원 영지 표)을 같이 지운다. */
export function dropScanCache(campId?: string) {
  invalidate(campId ? `scan:zones:${campId}` : "scan:");
  invalidate(campId ? `portal:${campId}` : "portal:");
  if (campId) invalidate(`scan:rooms:${campId}`);
}
