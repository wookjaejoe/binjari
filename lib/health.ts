import { MINUTE, memo } from "@/lib/cache";
import { shiftISO } from "@/lib/date";
import type { ZoneDay } from "@/lib/providers/types";
import { PORTALS, getProvider, resolveCamp } from "@/lib/registry";
import { checkInDates } from "@/lib/scan";

/**
 * 포털 점검. 캠핑장 하나에 예약 기간·구역 조회(1박 몇 날짜, 2박 한 날짜)·객실 조회를 한 번씩
 * 불러, 화면이 믿고 쓰는 모양이 맞는지 본다. 포털이 화면을 바꿔 파서가 어긋나면 대개 여기서 걸린다.
 *
 * - fail: 던졌거나 모양이 틀렸다 — 구역 없음, 남은 수가 음수이거나 전체보다 많음, 1박인데
 *   "물을 길 없음", 응답 없음(null).
 * - warn: 틀렸다고 단정할 수 없지만 사람이 볼 것 — 예약 기간 없음, 물어본 날이 전부 0.
 *   전부 0 은 매진일 수도 있지만, 빈 사이트 표시가 바뀌어 못 읽을 때도 똑같이 0 으로 보인다.
 *
 * 화면에는 쓰지 않는다. scripts/check-portals.ts 가 캠핑장마다 부른다.
 */

export type Health = {
  id: string;
  name: string;
  portalId: string;
  status: "ok" | "warn" | "fail";
  problems: string[];
  /** 물어본 날짜 → 1박 남은 수의 합 */
  sample: Record<string, number>;
  zones: string[];
  ms: number;
  checkedAt: string;
};

export type PortalListing = {
  id: string;
  label: string;
  camps: { id: string; name: string }[];
  error?: string;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 목록은 포털마다 따로 받는다. 한 포털이 목록을 못 주면 화면은 그 포털을 조용히 빼기 때문이다. */
export async function listPortals(): Promise<PortalListing[]> {
  return Promise.all(
    PORTALS.map(async (portal) => {
      try {
        const camps = await getProvider(portal).listCamps(portal);
        return { id: portal.id, label: portal.label, camps: camps.map(({ id, name }) => ({ id, name })) };
      } catch (error) {
        return { id: portal.id, label: portal.label, camps: [], error: message(error) };
      }
    }),
  );
}

/** 모양 검사. 틀린 곳마다 한 줄. */
export function shapeProblems(day: ZoneDay | null, label: string, nights: number): string[] {
  if (!day) return [`${label}: 응답 없음`];
  const problems: string[] = [];
  if (!day.zones.length) problems.push(`${label}: 구역 없음`);
  if (day.unanswered && nights === 1) problems.push(`${label}: 1박을 물을 길 없음`);
  const seen = new Set<string>();
  for (const zone of day.zones) {
    if (seen.has(zone.no)) problems.push(`${label}: 구역 번호 겹침(${zone.no})`);
    seen.add(zone.no);
    if (day.unanswered) continue;
    const count = day.counts[zone.no];
    if (!Number.isInteger(count) || count < 0) {
      problems.push(`${label}: ${zone.name} 남은 수 ${count}`);
    } else if (zone.total > 0 && count > zone.total) {
      problems.push(`${label}: ${zone.name} 남은 수 ${count} > 전체 ${zone.total}`);
    }
  }
  return problems;
}

/**
 * 표본 날짜. 첫 체크인 날과, 일주일 뒤부터 이레. 이레는 앞에서부터 묻다가 빈자리가 처음 나오면
 * 멈춘다 — 대개 한두 번이다. 이레 내내 0 일 때만 "전부 0" 이다. 요일을 하나 정해 두지 않는 까닭은
 * 쉬는 요일이 곳마다 달라서다(전월산·황산은 수요일, 합강은 화요일, 많은 곳이 월요일). 월요일이
 * 공휴일이면 휴관이 화요일로 밀리기도 한다(2026-10-05 대체공휴일 → 10-06).
 */
export function sampleDates(dates: string[]): { first: string; week: string[] } | null {
  if (!dates.length) return null;
  const from = shiftISO(dates[0], 7);
  const to = shiftISO(dates[0], 14);
  return { first: dates[0], week: dates.filter((date) => date >= from && date < to) };
}

export function checkCamp(campId: string): Promise<Health> {
  return memo(`health:${campId}`, 10 * MINUTE, async () => {
    const started = Date.now();
    const problems: string[] = [];
    const warnings: string[] = [];
    const sample: Record<string, number> = {};
    let zones: string[] = [];
    let name = campId;
    let portalId = campId.split(":")[0];

    const done = (): Health => ({
      id: campId,
      name,
      portalId,
      status: problems.length ? "fail" : warnings.length ? "warn" : "ok",
      problems: [...problems, ...warnings],
      sample,
      zones,
      ms: Date.now() - started,
      checkedAt: new Date().toISOString(),
    });

    let resolved;
    try {
      resolved = await resolveCamp(campId);
    } catch (error) {
      problems.push(`목록: ${message(error)}`);
      return done();
    }
    const { camp, portal, provider } = resolved;
    name = camp.name;
    portalId = portal.id;

    let window;
    try {
      window = await provider.bookingWindow(portal, camp);
    } catch (error) {
      problems.push(`예약 기간: ${message(error)}`);
      return done();
    }
    if (!window) {
      warnings.push("예약 기간 없음");
      return done();
    }
    const picked = sampleDates(checkInDates(window));
    if (!picked) {
      warnings.push(`예약 기간이 지났음(${window.start}–${window.end})`);
      return done();
    }
    const { first, week } = picked;

    let firstZone: string | undefined;
    /** 1박 한 날짜를 묻고 모양을 본다. 남은 수의 합, 못 읽었으면 null. */
    const probe = async (date: string) => {
      try {
        const day = await provider.zoneDay(portal, camp, date, 1);
        problems.push(...shapeProblems(day, `${date} 1박`, 1));
        if (!day || day.unanswered) return null;
        if (!zones.length) zones = day.zones.map((zone) => zone.name);
        firstZone ??= day.zones[0]?.no;
        sample[date] = day.zones.reduce((sum, zone) => sum + (day.counts[zone.no] ?? 0), 0);
        return sample[date];
      } catch (error) {
        problems.push(`${date} 1박: ${message(error)}`);
        return null;
      }
    };

    let found = (await probe(first)) ?? 0;
    for (const date of week) {
      if (found > 0 || problems.length) break;
      found = (await probe(date)) ?? 0;
    }
    if (!problems.length && found === 0) {
      const asked = Object.keys(sample);
      warnings.push(`물어본 ${asked.length}일(${asked[0]}–${asked.at(-1)})이 전부 0`);
    }

    try {
      problems.push(...shapeProblems(await provider.zoneDay(portal, camp, first, 2), `${first} 2박`, 2));
    } catch (error) {
      problems.push(`${first} 2박: ${message(error)}`);
    }

    if (firstZone) {
      try {
        const rooms = await provider.roomDay(portal, camp, firstZone, first, 1);
        if (!rooms) problems.push(`${first} 객실: 응답 없음`);
        else if (rooms.rooms.length) {
          const known = new Set(rooms.rooms.map((room) => room.no));
          const stray = rooms.available.filter((no) => !known.has(no));
          if (stray.length) problems.push(`${first} 객실: 목록에 없는 빈 객실 ${stray.slice(0, 3).join(", ")}`);
        }
      } catch (error) {
        problems.push(`${first} 객실: ${message(error)}`);
      }
    }

    return done();
  });
}
