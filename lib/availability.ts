import type { ZoneSelection } from "@/store/selection";
import type { CampProfile, RoomScan, Zone, ZoneScan } from "@/lib/types";

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
      capacity: number;
      total: number;
      partial: boolean;
      roomCount: number;
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

export type CellState = "open" | "full" | "outside" | "unknown";

export type Cell = {
  state: CellState;
  count: number;
  capacity: number;
  amount: number | null;
};

const OUTSIDE: Cell = { state: "outside", count: 0, capacity: 0, amount: null };
const UNKNOWN: Cell = { state: "unknown", count: 0, capacity: 0, amount: null };

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

    const zones: Zone[] = zoneScan?.zones.length
      ? zoneScan.zones
      : Object.keys(picks).map((no) => ({
          no,
          name: `구역 ${no}`,
          total: 0,
          size: "",
          maxPeop: 0,
          order: 0,
        }));

    for (const zone of zones) {
      const pick = picks[zone.no];
      if (!pick) continue;

      const catalog = zoneRooms(roomScan, zone.no);
      const chosen = selectedRooms(pick, catalog);
      const zoneKey = `${camp.id}::${zone.no}`;

      rows.push({
        kind: "zone",
        key: zoneKey,
        campId: camp.id,
        campName: camp.name,
        zoneNo: zone.no,
        label: zone.name,
        capacity: pick.mode === "all" ? zone.total : chosen.length,
        total: zone.total,
        partial: pick.mode === "some",
        roomCount: catalog.length,
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
  if (!zoneScan) return UNKNOWN;
  if (zoneScan.tooManyNights || !zoneScan.window) return OUTSIDE;
  if (!zoneScan.dates.includes(date)) {
    return zoneScan.failedDates.includes(date) ? UNKNOWN : OUTSIDE;
  }

  const amount = zoneScan.amounts[date]?.[row.zoneNo] ?? null;
  const roomScan = entry?.roomScan;

  if (row.kind === "room") {
    if (!roomScan) return UNKNOWN;
    const open = (roomScan.available[date] ?? []).includes(row.roomNo);
    return { state: open ? "open" : "full", count: open ? 1 : 0, capacity: 1, amount };
  }

  const pick = selection[row.campId]?.[row.zoneNo];
  if (pick?.mode === "some") {
    if (!roomScan) return UNKNOWN;
    const openHere = new Set(roomScan.available[date] ?? []);
    const count = pick.rooms.filter((no) => openHere.has(no)).length;
    return {
      state: count > 0 ? "open" : "full",
      count,
      capacity: pick.rooms.length,
      amount,
    };
  }

  const count = zoneScan.counts[date]?.[row.zoneNo] ?? 0;
  return {
    state: count > 0 ? "open" : "full",
    count,
    capacity: row.total,
    amount,
  };
}

export type DaySummary = {
  date: string;
  openRows: number;
  openUnits: number;
  /** 그 날짜에 예약 기간이 걸쳐 있는 구역 수 */
  activeRows: number;
  minAmount: number | null;
};

export function summarizeDays(
  dates: string[],
  rows: Row[],
  data: CampData[],
  selection: Record<string, Record<string, ZoneSelection>>,
): DaySummary[] {
  const zoneRows = rows.filter((r) => r.kind === "zone");
  return dates.map((date) => {
    let openRows = 0;
    let openUnits = 0;
    let activeRows = 0;
    let minAmount: number | null = null;

    for (const row of zoneRows) {
      const cell = evaluate(row, date, data, selection);
      if (cell.state === "outside") continue;
      activeRows++;
      if (cell.state !== "open") continue;
      openRows++;
      openUnits += cell.count;
      if (cell.amount != null && (minAmount == null || cell.amount < minAmount)) {
        minAmount = cell.amount;
      }
    }
    return { date, openRows, openUnits, activeRows, minAmount };
  });
}
