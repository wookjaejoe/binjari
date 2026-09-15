import type { ZoneSelection } from "@/store/selection";
import type { CampProfile, RoomScan, ZoneScan } from "@/lib/types";

export type CampData = {
  camp: CampProfile;
  zoneScan?: ZoneScan;
  roomScan?: RoomScan;
};

export type Row =
  | {
      kind: "zone";
      key: string;
      campId: string;
      campName: string;
      zoneNo: string;
      label: string;
      /** 구역 안에서 객실 일부만 골랐다 */
      partial: boolean;
      photo: string | null;
      ground: string;
    }
  | {
      kind: "room";
      key: string;
      campId: string;
      campName: string;
      zoneNo: string;
      zoneName: string;
      roomNo: string;
      label: string;
    };

/**
 * open     포털이 그 날짜에 열린 자리가 있다고 했다
 * none     포털이 0 을 줬다. 기간 밖도 여기 — 포털은 "기간 아님"과 "없음"을 구분하지 않는다
 * unknown  물어보지 못했거나 답을 못 받았다. none 과 반드시 구분한다
 */
export type CellState = "open" | "none" | "unknown";

/** count·amount 는 상세에서 포털 값을 그대로 보여주기 위한 것. 격자의 판단에는 안 쓴다. */
export type Cell = {
  state: CellState;
  count: number;
  amount: number | null;
};

const UNKNOWN: Cell = { state: "unknown", count: 0, amount: null };

export function selectedRooms(
  selection: ZoneSelection | undefined,
  allRooms: string[],
): string[] {
  if (!selection) return [];
  return selection.mode === "all" ? allRooms : selection.rooms;
}

function zoneRooms(roomScan: RoomScan | undefined, zoneNo: string): string[] {
  return (roomScan?.rooms ?? []).filter((r) => r.zoneNo === zoneNo).map((r) => r.no);
}

export function dateColumns(data: CampData[]): string[] {
  const all = new Set<string>();
  for (const entry of data) for (const date of entry.zoneScan?.dates ?? []) all.add(date);
  return [...all].sort();
}

export function buildRows(
  data: CampData[],
  selection: Record<string, Record<string, ZoneSelection>>,
  expanded: Record<string, boolean>,
): Row[] {
  const rows: Row[] = [];

  for (const { camp, zoneScan, roomScan } of data) {
    const picks = selection[camp.id];
    if (!picks) continue;

    // 구역 메타를 모르는 채로 행을 만들면 조회 대상이 아닌 자리까지 이름을 지어내
    // 결과에 섞인다. 스캔이 도착할 때까지 기다린다. 선택 자체는 그대로 둔다.
    for (const zone of zoneScan?.zones ?? []) {
      const pick = picks[zone.no];
      if (!pick) continue;

      const chosen = selectedRooms(pick, zoneRooms(roomScan, zone.no));
      const zoneKey = `${camp.id}::${zone.no}`;

      rows.push({
        kind: "zone",
        key: zoneKey,
        campId: camp.id,
        campName: camp.name,
        zoneNo: zone.no,
        label: zone.name,
        partial: pick.mode === "some",
        photo: zone.photo,
        ground: zone.ground,
      });

      if (!expanded[zoneKey]) continue;

      for (const roomNo of chosen) {
        const room = roomScan?.rooms.find((r) => r.no === roomNo);
        rows.push({
          kind: "room",
          key: `${zoneKey}::${roomNo}`,
          campId: camp.id,
          campName: camp.name,
          zoneNo: zone.no,
          zoneName: zone.name,
          roomNo,
          label: room?.name ?? `객실 ${roomNo}`,
        });
      }
    }
  }

  return rows;
}

export function evaluate(
  row: Row,
  date: string,
  data: CampData[],
  selection: Record<string, Record<string, ZoneSelection>>,
): Cell {
  const entry = data.find((d) => d.camp.id === row.campId);
  const zoneScan = entry?.zoneScan;
  const roomScan = entry?.roomScan;
  const amount = zoneScan?.amounts[date]?.[row.zoneNo] ?? null;

  // 객실 응답은 구역 응답과 따로 온다. 구역 조회가 실패한 날이라도 객실 응답이
  // 있으면 그 값을 쓴다 — 모름은 객실 쪽이 답을 못 받았을 때만이다.
  if (row.kind === "room") {
    if (!roomScan) return UNKNOWN;
    if (roomScan.failed[row.zoneNo]?.includes(date)) return UNKNOWN;
    const open = (roomScan.available[date] ?? []).includes(row.roomNo);
    return { state: open ? "open" : "none", count: open ? 1 : 0, amount };
  }

  if (!zoneScan || !zoneScan.window) return UNKNOWN;
  if (zoneScan.failedDates.includes(date)) return UNKNOWN;

  const pick = selection[row.campId]?.[row.zoneNo];
  if (pick?.mode === "some") {
    if (!roomScan) return UNKNOWN;
    if (roomScan.failed[row.zoneNo]?.includes(date)) return UNKNOWN;
    const openHere = new Set(roomScan.available[date] ?? []);
    const count = pick.rooms.filter((no) => openHere.has(no)).length;
    return { state: count > 0 ? "open" : "none", count, amount };
  }

  // 이 캠핑장이 묻지 않은 날짜(다른 캠핑장 기간이 열로 온 것)도 none 이다.
  // 그 날은 물어도 포털이 0 을 준다.
  const count = zoneScan.counts[date]?.[row.zoneNo] ?? 0;
  return { state: count > 0 ? "open" : "none", count, amount };
}

export type DaySummary = {
  date: string;
  /** 그 날짜에 열린 행이 하나라도 있다 */
  open: boolean;
  /** 그 날짜에 답을 못 받은 행이 하나라도 있다 */
  unknown: boolean;
};

export function summarizeDays(
  dates: string[],
  rows: Row[],
  data: CampData[],
  selection: Record<string, Record<string, ZoneSelection>>,
): DaySummary[] {
  const zoneRows = rows.filter((r) => r.kind === "zone");
  return dates.map((date) => {
    let open = false;
    let unknown = false;
    for (const row of zoneRows) {
      const state = evaluate(row, date, data, selection).state;
      if (state === "open") open = true;
      else if (state === "unknown") unknown = true;
    }
    return { date, open, unknown };
  });
}
