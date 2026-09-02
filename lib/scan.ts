import { MINUTE, createLimiter, invalidate, memo } from "@/lib/cache";
import { enumerateDates, shiftISO, todayISO } from "@/lib/date";
import { isBookableZone } from "@/lib/policy";
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

/** nights박 체크인이 가능한 날짜 범위. 체크아웃이 예약 마감일 다음날을 넘지 못한다. */
export function checkInDates(window: BookingWindow, nights: number): string[] {
  const start = todayISO() > window.start ? todayISO() : window.start;
  const last = shiftISO(window.end, -(nights - 1));
  if (last < start) return [];
  return enumerateDates(start, last);
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
      return {
        ...base,
        tooManyNights: false,
        dates: [],
        zones: [],
        counts: {},
        amounts: {},
        failedDates: [],
      };
    }
    if (nights > window.maxStay) {
      return {
        ...base,
        tooManyNights: true,
        dates: [],
        // 조회는 못 하지만 구역 이름은 살려 둔다. 화면에서 이름 없는 행이 되지 않도록.
        zones: nights === 1 ? [] : (await scanZones(campId, 1)).zones,
        counts: {},
        amounts: {},
        failedDates: [],
      };
    }

    const dates = checkInDates(window, nights);
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
        if (isBookableZone(zone) && !zones.has(zone.no)) zones.set(zone.no, zone);
      }
      counts[date] = day.counts;
      amounts[date] = day.amounts;
    }

    return {
      ...base,
      tooManyNights: false,
      dates: dates.filter((d) => !failedDates.includes(d)),
      zones: [...zones.values()].sort((a, b) => a.order - b.order),
      counts,
      amounts,
      failedDates,
    };
  });
}

/**
 * 객실 단위 가용성. 존이 마감인 날은 어차피 빈 응답이므로 건너뛴다.
 * `zoneFilter`를 주면 그 존만 조회한다.
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
    const wanted = zoneScan.zones.filter(
      (z) => !zoneFilter?.length || zoneFilter.includes(z.no),
    );

    const tasks: { date: string; zoneNo: string }[] = [];
    for (const date of zoneScan.dates) {
      for (const zone of wanted) {
        if ((zoneScan.counts[date]?.[zone.no] ?? 0) > 0) {
          tasks.push({ date, zoneNo: zone.no });
        }
      }
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
    const covered = new Set<string>();

    for (const { date, zoneNo, day } of results) {
      if (!day) continue;
      if (day.rooms.length) covered.add(zoneNo);
      for (const room of day.rooms) if (!rooms.has(room.no)) rooms.set(room.no, room);
      if (day.available.length) {
        available[date] = [...(available[date] ?? []), ...day.available];
      }
    }

    return {
      campId,
      nights,
      rooms: [...rooms.values()].sort((a, b) => a.name.localeCompare(b.name, "ko")),
      available,
      zonesWithoutCatalog: wanted.filter((z) => !covered.has(z.no)).map((z) => z.no),
      generatedAt: new Date().toISOString(),
    };
  });
}

/**
 * 캠핑장 한 곳의 운영 상태. 예약 기간이 없으면 미오픈, 기간은 있는데
 * 실제 예약 가능한 구역이 없으면 준비 중으로 본다.
 */
export function campProfile(campId: string): Promise<CampProfile> {
  return memo(`profile:${campId}`, 10 * MINUTE, async () => {
    const { camp, portal, provider } = await resolveCamp(campId);
    const window = await provider.bookingWindow(portal, camp);
    const base = {
      id: campId,
      name: camp.name,
      portalId: portal.id,
      portalLabel: portal.label,
      window,
    };

    if (!window) {
      return { ...base, status: "unopened" as const, zoneCount: 0, roomCount: 0 };
    }

    const probe = checkInDates(window, 1)[0] ?? window.start;
    const day = await provider.zoneDay(portal, camp, probe, 1).catch(() => null);
    const zones = (day?.zones ?? []).filter(isBookableZone);

    return {
      ...base,
      status: zones.length ? ("open" as const) : ("preparing" as const),
      zoneCount: zones.length,
      roomCount: zones.reduce((sum, zone) => sum + zone.total, 0),
    };
  });
}

export function dropScanCache(campId?: string) {
  invalidate(campId ? `scan:zones:${campId}` : "scan:");
  if (campId) invalidate(`scan:rooms:${campId}`);
}
