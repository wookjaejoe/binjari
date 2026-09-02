import { describe, expect, it } from "vitest";

import {
  buildRows,
  dateColumns,
  evaluate,
  summarizeDays,
  type CampData,
} from "@/lib/availability";
import type { ZoneSelection } from "@/store/selection";

const camp = {
  id: "gwgs:bongsucamp",
  name: "봉수대오토캠핑장",
  portalId: "gwgs",
  portalLabel: "고성군",
  window: { start: "2026-09-02", end: "2026-09-05", minStay: 1, maxStay: 7 },
  status: "open" as const,
  zoneCount: 2,
  roomCount: 8,
};

function bundle(overrides: Partial<CampData> = {}): CampData {
  return {
    camp,
    zoneScan: {
      campId: camp.id,
      campName: camp.name,
      nights: 1,
      window: camp.window,
      tooManyNights: false,
      dates: ["2026-09-02", "2026-09-03", "2026-09-04"],
      zones: [
        { no: "27", name: "카라반6인특실", total: 6, size: "", maxPeop: 6, order: 4 },
        { no: "10", name: "카라반4인", total: 2, size: "", maxPeop: 4, order: 6 },
      ],
      counts: {
        "2026-09-02": { "27": 3, "10": 0 },
        "2026-09-03": { "27": 0, "10": 2 },
        "2026-09-04": { "27": 6, "10": 1 },
      },
      amounts: {
        "2026-09-02": { "27": 140000, "10": 80000 },
        "2026-09-03": { "27": 140000, "10": 80000 },
        "2026-09-04": { "27": 200000, "10": 80000 },
      },
      failedDates: ["2026-09-05"],
      generatedAt: "2026-09-02T12:00:00.000Z",
    },
    roomScan: {
      campId: camp.id,
      nights: 1,
      rooms: [
        { no: "477", zoneNo: "27", name: "카라반(특)6-1", amount: 140000, size: "" },
        { no: "485", zoneNo: "27", name: "카라반(특)6-2", amount: 140000, size: "" },
        { no: "486", zoneNo: "27", name: "카라반(특)6-3", amount: 140000, size: "" },
      ],
      available: {
        "2026-09-02": ["477", "486"],
        "2026-09-04": ["477", "485", "486"],
      },
      zonesWithoutCatalog: ["10"],
      generatedAt: "2026-09-02T12:00:00.000Z",
    },
    ...overrides,
  };
}

const all: Record<string, Record<string, ZoneSelection>> = {
  [camp.id]: { "27": { mode: "all" }, "10": { mode: "all" } },
};

describe("dateColumns", () => {
  it("스캔에 성공한 날짜만 정렬해 돌려준다", () => {
    expect(dateColumns([bundle()])).toEqual([
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });
});

describe("buildRows", () => {
  it("선택한 구역만 구역 순서대로 행을 만든다", () => {
    const rows = buildRows([bundle()], all, {});
    expect(rows.map((row) => row.label)).toEqual(["카라반6인특실", "카라반4인"]);
  });

  it("선택하지 않은 캠핑장은 제외한다", () => {
    expect(buildRows([bundle()], {}, {})).toEqual([]);
  });

  it("펼친 구역은 선택된 객실을 행으로 펼친다", () => {
    const rows = buildRows([bundle()], all, { [`${camp.id}::27`]: true });
    expect(rows.map((row) => row.label)).toEqual([
      "카라반6인특실",
      "카라반(특)6-1",
      "카라반(특)6-2",
      "카라반(특)6-3",
      "카라반4인",
    ]);
  });

  it("일부 선택이면 선택한 객실만 펼친다", () => {
    const partial = {
      [camp.id]: { "27": { mode: "some", rooms: ["486"] } as ZoneSelection },
    };
    const rows = buildRows([bundle()], partial, { [`${camp.id}::27`]: true });
    expect(rows.map((row) => row.label)).toEqual([
      "카라반6인특실",
      "카라반(특)6-3",
    ]);
    expect(rows[0].kind === "zone" && rows[0].capacity).toBe(1);
    expect(rows[0].kind === "zone" && rows[0].partial).toBe(true);
  });
});

describe("evaluate", () => {
  const data = [bundle()];
  const rows = buildRows(data, all, { [`${camp.id}::27`]: true });
  const zoneRow = rows.find((row) => row.kind === "zone" && row.zoneNo === "27")!;
  const roomRow = rows.find((row) => row.kind === "room" && row.roomNo === "485")!;

  it("구역 전체 선택이면 구역 잔여 수를 쓴다", () => {
    expect(evaluate(zoneRow, "2026-09-02", data, all)).toMatchObject({
      state: "open",
      count: 3,
      capacity: 6,
      amount: 140000,
    });
  });

  it("잔여가 없으면 마감이다", () => {
    expect(evaluate(zoneRow, "2026-09-03", data, all).state).toBe("full");
  });

  it("스캔이 실패한 날짜는 조회 불가로 구분한다", () => {
    expect(evaluate(zoneRow, "2026-09-05", data, all).state).toBe("unknown");
  });

  it("예약 기간 밖은 기간 아님으로 구분한다", () => {
    expect(evaluate(zoneRow, "2026-10-01", data, all).state).toBe("outside");
  });

  it("객실 행은 그 객실의 가용 여부만 본다", () => {
    expect(evaluate(roomRow, "2026-09-02", data, all).state).toBe("full");
    expect(evaluate(roomRow, "2026-09-04", data, all).state).toBe("open");
  });

  it("일부 선택은 선택한 객실 중 가능한 수만 센다", () => {
    const partial = {
      [camp.id]: { "27": { mode: "some", rooms: ["485", "486"] } as ZoneSelection },
    };
    const partialRows = buildRows(data, partial, {});
    expect(evaluate(partialRows[0], "2026-09-02", data, partial)).toMatchObject({
      state: "open",
      count: 1,
      capacity: 2,
    });
  });

  it("최대 숙박일수를 넘긴 캠핑장은 전 기간이 기간 아님이다", () => {
    const blocked = bundle({
      zoneScan: { ...bundle().zoneScan!, tooManyNights: true, dates: [] },
    });
    const blockedRows = buildRows([blocked], all, {});
    expect(evaluate(blockedRows[0], "2026-09-02", [blocked], all).state).toBe(
      "outside",
    );
  });

  it("객실 데이터가 아직 없으면 일부 선택은 판단을 보류한다", () => {
    const partial = {
      [camp.id]: { "27": { mode: "some", rooms: ["485"] } as ZoneSelection },
    };
    const noRooms = bundle({ roomScan: undefined });
    const partialRows = buildRows([noRooms], partial, {});
    expect(evaluate(partialRows[0], "2026-09-02", [noRooms], partial).state).toBe(
      "unknown",
    );
  });
});

describe("summarizeDays", () => {
  it("가능한 구역 수·동수·최저가를 집계한다", () => {
    const data = [bundle()];
    const rows = buildRows(data, all, {});
    const [first, second, third] = summarizeDays(
      ["2026-09-02", "2026-09-03", "2026-09-04"],
      rows,
      data,
      all,
    );

    expect(first).toMatchObject({ openRows: 1, openUnits: 3, minAmount: 140000 });
    expect(second).toMatchObject({ openRows: 1, openUnits: 2, minAmount: 80000 });
    expect(third).toMatchObject({ openRows: 2, openUnits: 7, minAmount: 80000 });
    expect(third.activeRows).toBe(2);
  });

  it("예약 기간 밖 날짜는 활성 구역이 없다", () => {
    const data = [bundle()];
    const rows = buildRows(data, all, {});
    expect(summarizeDays(["2026-11-01"], rows, data, all)[0]).toMatchObject({
      openRows: 0,
      activeRows: 0,
    });
  });
});
