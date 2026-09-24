import type { ZoneSelection } from "@/store/selection";
import type { CampProfile, RoomScan, ZoneScan } from "@/lib/types";

export type CampData = {
  camp: CampProfile;
  zoneScan?: ZoneScan;
  roomScan?: RoomScan;
  /**
   * 객실 조회의 첫 응답을 기다리는 중. 객실 스캔이 없을 때 이것이 켜져 있으면 모름이 아니라
   * 조회 중이다. 구역 쪽에는 두지 않는다 — 구역 스캔이 없으면 행 자체가 안 만들어진다.
   */
  roomPending?: boolean;
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
 * none     포털이 0 을 줬다
 * unknown  물었는데 답을 못 받았다(조회 실패). none 과 반드시 구분한다
 * loading  지금 묻는 중이다. 곧 위 셋 중 하나가 된다. unknown 으로 그리면 `?`가 깜빡인다
 * unasked  이 캠핑장에는 묻지 않은 날이다 — 포털이 준 예약 기간 밖인데, 다른 캠핑장의 기간
 *          때문에 화면에 열이 생긴 경우다. 묻지 않았으니 없다고 말할 수 없다. 칸을 그리지 않는다
 */
export type CellState = "open" | "none" | "unknown" | "loading" | "unasked";

/** count·amount 는 상세에서 포털 값을 그대로 보여주기 위한 것. 격자의 판단에는 안 쓴다. */
export type Cell = {
  state: CellState;
  count: number;
  amount: number | null;
};

const UNKNOWN: Cell = { state: "unknown", count: 0, amount: null };
const LOADING: Cell = { state: "loading", count: 0, amount: null };
const UNASKED: Cell = { state: "unasked", count: 0, amount: null };

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

  // 스캔은 그 캠핑장의 예약 기간 안만 묻는다(dates 에는 실패한 날도 들어 있다). 기간 조회가
  // 실패해 window 가 없으면 아래에서 전부 모름이 된다.
  if (zoneScan?.window && !zoneScan.dates.includes(date)) return UNASKED;

  // 객실 응답은 구역 응답과 따로 온다. 구역 조회가 실패한 날이라도 객실 응답이
  // 있으면 그 값을 쓴다 — 모름은 객실 쪽이 답을 못 받았을 때만이다.
  if (row.kind === "room") {
    if (!roomScan) return entry?.roomPending ? LOADING : UNKNOWN;
    if (roomScan.failed[row.zoneNo]?.includes(date)) return UNKNOWN;
    const open = (roomScan.available[date] ?? []).includes(row.roomNo);
    return { state: open ? "open" : "none", count: open ? 1 : 0, amount };
  }

  if (!zoneScan || !zoneScan.window) return UNKNOWN;
  if (zoneScan.failedDates.includes(date)) return UNKNOWN;

  const pick = selection[row.campId]?.[row.zoneNo];
  if (pick?.mode === "some") {
    if (!roomScan) return entry?.roomPending ? LOADING : UNKNOWN;
    if (roomScan.failed[row.zoneNo]?.includes(date)) return UNKNOWN;
    const openHere = new Set(roomScan.available[date] ?? []);
    const count = pick.rooms.filter((no) => openHere.has(no)).length;
    return { state: count > 0 ? "open" : "none", count, amount };
  }

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
