import { HOUR, MINUTE, memo } from "@/lib/cache";
import { compactToISO, dayOfMonth, shiftISO } from "@/lib/date";
import {
  ORIGIN,
  between,
  fetchText,
  parsePhotos,
  rowsOf,
} from "@/lib/providers/knps";
import type { CampProvider, CampRef, Portal, Zone, ZoneDay } from "@/lib/providers/types";

/**
 * 국립공원 대피소. 야영장과 같은 예약시스템이지만 표의 모양이 다르다.
 *
 * - 캠핑장 하나 = 공원 하나(지리산·설악산·덕유산·소백산), 구역 하나 = 대피소 하나다.
 * - 칸은 자리(사람) 수다. `title="예약가능:37"`, 정원은 `data-max_cnt`. 영지처럼 한 칸이 한
 *   자리가 아니라서 객실 단계가 없다.
 * - 예약은 하루씩 따로 담는다. 날짜를 누르면 그 날 한 건이 담기고, 종주는 날마다 다른 대피소를
 *   담는다(shelter.js). 여러 박을 한 번에 고르는 길이 없으니 2박 이상은 없음이다.
 */

const LIST_PAGE = `${ORIGIN}/reservation/shelter/searchSimpleShelterReservation.do`;
const MAX_NIGHTS = 1;
const GRID_TTL = 2 * MINUTE;

type Shelter = {
  name: string;
  /** 대피소마다 붙은 부서 번호(B011001). 이용안내 사진을 찾을 때 쓴다. 예약 끝난 칸에는 없다. */
  deptId: string | null;
  capacity: number;
  nights: Record<string, { open: boolean; left: number; amount: number | null }>;
};

export type ShelterGrid = { dates: string[]; shelters: Shelter[] };

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

/**
 * 대피소 표를 읽는다. 왼쪽 고정 열에 대피소 이름이, 오른쪽 본문에 같은 순서로 날짜 칸이 있다.
 * 예약가능·대기가능 칸에만 `data-use_dt` 가 있고 예약만료 칸에는 날짜가 없다. 그래서 날짜가
 * 붙은 칸 하나에서 첫 열의 날짜를 거꾸로 세고, 머리 줄의 일(日) 숫자와 맞는지 확인한다.
 */
export function parseShelterGrid(html: string): ShelterGrid {
  const side = between(html, 'class="table-sticky-body"', "</table>");
  const head = between(html, 'class="table-head"', "</table>");
  const body = between(between(html, 'class="table-body"', "</table>") ?? "", "<tbody");
  if (!side || !head || !body) throw new Error("대피소 표를 찾지 못했습니다");

  const names = rowsOf(side).map((row) => {
    const cells = [...row.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)];
    return (cells.at(-1)?.[1] ?? "").replace(/<[^>]*>/g, "").trim();
  });
  const days = [...head.matchAll(/<td[^>]*>\s*(\d{2})\s*<\/td>/g)].map((m) => Number(m[1]));

  const rows = rowsOf(body).map((row) =>
    [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
      (cell) => cell[1].match(/<i [^>]*>/)?.[0] ?? "",
    ),
  );

  let first: string | null = null;
  for (const cells of rows) {
    const index = cells.findIndex((tag) => attr(tag, "data-use_dt"));
    if (index < 0) continue;
    first = shiftISO(compactToISO(attr(cells[index], "data-use_dt")!), -index);
    break;
  }
  if (!first || !days.length) throw new Error("대피소 표에 날짜가 없습니다");

  const dates = days.map((_, index) => shiftISO(first!, index));
  if (dates.some((date, index) => dayOfMonth(date) !== days[index])) {
    throw new Error("대피소 표의 날짜 열이 맞지 않습니다");
  }

  const shelters = rows.map((cells, index): Shelter => {
    const nights: Shelter["nights"] = {};
    let capacity = 0;
    let deptId: string | null = null;
    cells.forEach((tag, column) => {
      const date = dates[column];
      if (!date || !tag) return;
      const open = /class="icon-reservation"/.test(tag);
      const left = Number(attr(tag, "title")?.match(/예약가능:(\d+)/)?.[1] ?? 0);
      const price = attr(tag, "data-price");
      if (open) capacity = Math.max(capacity, Number(attr(tag, "data-max_cnt") ?? 0));
      deptId ??= attr(tag, "data-dept-id") ?? null;
      nights[date] = { open: open && left > 0, left: open ? left : 0, amount: price ? Number(price) : null };
    });
    return { name: names[index] ?? "", deptId, capacity, nights };
  });

  return { dates, shelters };
}

export function shelterDayOf(grid: ShelterGrid, date: string, nights: number): ZoneDay {
  const counts: Record<string, number> = {};
  const amounts: Record<string, number | null> = {};
  const zones: Zone[] = grid.shelters.map((shelter, order) => {
    const night = shelter.nights[date];
    const open = nights <= MAX_NIGHTS && night?.open;
    counts[shelter.name] = open ? night.left : 0;
    amounts[shelter.name] = open ? night.amount : null;
    return {
      no: shelter.name,
      name: shelter.name,
      total: shelter.capacity,
      unit: "자리",
      size: "",
      maxPeop: 0,
      order,
      photo: null,
      ground: "",
    };
  });
  return { zones, counts, amounts };
}

function grid(camp: CampRef): Promise<ShelterGrid> {
  return memo(`portal:${camp.id}:grid`, GRID_TTL, async () =>
    parseShelterGrid(
      await fetchText(`${ORIGIN}/reservation/shelter/tabShelter.do`, {
        deptId: camp.slug,
        deptNm: camp.name.replace(/ 대피소$/, ""),
        isGreenpoint: "N",
      }),
    ),
  );
}

/** 대피소 이용안내 사진첩(`지리산_벽소령_1`…)의 첫 사진. */
function photoOf(shelter: Shelter): Promise<string | null> {
  const deptId = shelter.deptId;
  if (!deptId) return Promise.resolve(null);
  return memo(`knps:shelter-photo:${deptId}`, 12 * HOUR, async () => {
    const html = await fetchText(
      `${ORIGIN}/contents/S/serviceGuide.do?parkId=${deptId.slice(0, 3)}&deptId=${deptId}&prdDvcd=S`,
    );
    return parsePhotos(html)[0]?.src ?? null;
  }).catch(() => null);
}

export const knpsShelter: CampProvider = {
  id: "knpsShelter",
  cheapWindow: false,

  async listCamps(portal: Portal) {
    return memo(`knps:shelters`, 12 * HOUR, async () => {
      const html = await fetchText(LIST_PAGE);
      const camps: CampRef[] = [];
      const seen = new Set<string>();
      for (const [, deptId, park] of html.matchAll(
        /data-dept-id="([A-Z0-9]+)" data-dept-nm="([^"]+)"/g,
      )) {
        if (seen.has(deptId)) continue;
        seen.add(deptId);
        camps.push({
          id: `${portal.id}:${deptId}`,
          portalId: portal.id,
          slug: deptId,
          name: `${park} 대피소`,
        });
      }
      if (!camps.length) throw new Error("대피소 목록을 찾지 못했습니다");
      return camps;
    });
  },

  async bookingWindow(_portal, camp) {
    const { dates } = await grid(camp);
    return { start: dates[0], end: dates.at(-1)!, maxStay: MAX_NIGHTS, minStay: null };
  },

  async zoneDay(_portal, camp, date, nights) {
    const table = await grid(camp);
    const day = shelterDayOf(table, date, nights);
    const photos = await Promise.all(table.shelters.map(photoOf));
    return { ...day, zones: day.zones.map((zone, i) => ({ ...zone, photo: photos[i] })) };
  },

  /** 대피소는 자리가 한 칸씩 나뉘어 있지 않다. 객실 단계가 없다. */
  async roomDay() {
    return { rooms: [], available: [] };
  },

  bookingTarget() {
    return { url: LIST_PAGE, method: "GET", fields: {} };
  },
};
