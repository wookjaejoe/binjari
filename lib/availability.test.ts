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
  window: { start: "2026-09-02", end: "2026-09-05", maxStay: 3, minStay: 1 },
};

function bundle(overrides: Partial<CampData> = {}): CampData {
  return {
    camp,
    zoneScan: {
      campId: camp.id,
      campName: camp.name,
      nights: 1,
      window: camp.window,
      // 09-05 는 물었지만 답을 못 받은 날
      dates: ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"],
      zones: [
        {
          no: "27",
          name: "카라반6인특실",
          total: 6,
          size: "",
          maxPeop: 6,
          order: 4,
          photo: null,
          ground: "데크",
        },
        {
          no: "10",
          name: "카라반4인",
          total: 2,
          size: "",
          maxPeop: 4,
          order: 6,
          photo: null,
          ground: "데크",
        },
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
        {
          no: "477",
          zoneNo: "27",
          name: "카라반(특)6-1",
          amount: 140000,
          size: "",
        },
        {
          no: "485",
          zoneNo: "27",
          name: "카라반(특)6-2",
          amount: 140000,
          size: "",
        },
        {
          no: "486",
          zoneNo: "27",
          name: "카라반(특)6-3",
          amount: 140000,
          size: "",
        },
      ],
      available: {
        "2026-09-02": ["477", "486"],
        "2026-09-04": ["477", "485", "486"],
      },
      // 27번 구역은 09-03 객실 조회에 실패했다
      failed: { "27": ["2026-09-03"] },
      generatedAt: "2026-09-02T12:00:00.000Z",
    },
    ...overrides,
  };
}

const all: Record<string, Record<string, ZoneSelection>> = {
  [camp.id]: { "27": { mode: "all" }, "10": { mode: "all" } },
};

describe("dateColumns", () => {
  it("물어본 날짜 전부를 정렬해 돌려준다 — 실패한 날도 열이 된다", () => {
    expect(dateColumns([bundle()])).toEqual([
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });

  it("여러 캠핑장의 날짜는 합집합이다", () => {
    const other = bundle({
      camp: { ...camp, id: "gwgs:song" },
      zoneScan: {
        ...bundle().zoneScan!,
        campId: "gwgs:song",
        dates: ["2026-09-04", "2026-09-06"],
        failedDates: [],
      },
    });
    expect(dateColumns([bundle(), other])).toEqual([
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });
});

describe("buildRows", () => {
  it("선택한 구역만 구역 순서대로 행을 만든다", () => {
    const rows = buildRows([bundle()], all, {});
    expect(rows.map((row) => row.label)).toEqual([
      "카라반6인특실",
      "카라반4인",
    ]);
  });

  it("선택하지 않은 캠핑장은 제외한다", () => {
    expect(buildRows([bundle()], {}, {})).toEqual([]);
  });

  it("구역 메타를 모르면 행을 만들지 않는다 — 조회 대상 아닌 자리가 섞이면 안 된다", () => {
    const noScan = bundle({ zoneScan: undefined });
    const stale = { [camp.id]: { "30": { mode: "all" } as ZoneSelection } };
    expect(buildRows([noScan], stale, {})).toEqual([]);
  });

  it("스캔에 없는 구역이 선택에 남아 있어도 행만 안 만들 뿐 선택은 건드리지 않는다", () => {
    const stale = {
      [camp.id]: {
        "27": { mode: "all" } as ZoneSelection,
        "999": { mode: "all" } as ZoneSelection,
      },
    };
    expect(buildRows([bundle()], stale, {}).map((row) => row.label)).toEqual([
      "카라반6인특실",
    ]);
    expect(stale[camp.id]["999"]).toEqual({ mode: "all" });
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
    expect(rows[0].kind === "zone" && rows[0].partial).toBe(true);
  });
});

describe("evaluate", () => {
  const data = [bundle()];
  const rows = buildRows(data, all, { [`${camp.id}::27`]: true });
  const zoneRow = rows.find(
    (row) => row.kind === "zone" && row.zoneNo === "27",
  )!;
  const roomRow = rows.find(
    (row) => row.kind === "room" && row.roomNo === "485",
  )!;

  it("구역 전체 선택이면 구역 잔여가 있을 때 있음이다. 수와 금액은 포털 값 그대로", () => {
    expect(evaluate(zoneRow, "2026-09-02", data, all)).toEqual({
      state: "open",
      count: 3,
      amount: 140000,
    });
  });

  it("포털이 0 을 주면 없음이다", () => {
    expect(evaluate(zoneRow, "2026-09-03", data, all).state).toBe("none");
  });

  it("구역 조회에 실패한 날짜는 모름이다", () => {
    expect(evaluate(zoneRow, "2026-09-05", data, all).state).toBe("unknown");
  });

  it("예약 기간 밖은 없음이다 — 포털은 기간 아님과 없음을 구분하지 않는다", () => {
    expect(evaluate(zoneRow, "2026-10-01", data, all).state).toBe("none");
  });

  it("다른 캠핑장 기간이라 이 캠핑장이 묻지 않은 날짜도 없음이다", () => {
    const other = bundle({
      camp: { ...camp, id: "gwgs:song" },
      zoneScan: {
        ...bundle().zoneScan!,
        campId: "gwgs:song",
        dates: ["2026-09-06"],
        failedDates: [],
      },
    });
    const both = [bundle(), other];
    expect(evaluate(zoneRow, "2026-09-06", both, all).state).toBe("none");
  });

  it("구역 스캔이 아직 없으면 모름이다", () => {
    const noScan = bundle({ zoneScan: undefined });
    expect(evaluate(zoneRow, "2026-09-02", [noScan], all).state).toBe("unknown");
  });

  it("예약 기간 조회에 실패한 캠핑장은 전 날짜가 모름이다", () => {
    const noWindow = bundle({
      camp: { ...camp, window: null, error: "HTTP 502" },
      zoneScan: { ...bundle().zoneScan!, window: null, dates: [], counts: {}, amounts: {} },
    });
    expect(evaluate(zoneRow, "2026-09-02", [noWindow], all).state).toBe("unknown");
  });

  it("객실 행은 그 객실이 열린 목록에 있는지만 본다", () => {
    expect(evaluate(roomRow, "2026-09-02", data, all).state).toBe("none");
    expect(evaluate(roomRow, "2026-09-04", data, all).state).toBe("open");
  });

  it("객실 조회에 실패한 날짜는 객실 행이 모름이다", () => {
    expect(evaluate(roomRow, "2026-09-03", data, all).state).toBe("unknown");
  });

  it("구역 조회가 실패한 날짜라도 객실 응답이 있으면 객실 행은 그 값을 쓴다", () => {
    const base = bundle();
    const withRooms = bundle({
      roomScan: {
        ...base.roomScan!,
        available: { ...base.roomScan!.available, "2026-09-05": ["485"] },
      },
    });
    expect(evaluate(roomRow, "2026-09-05", [withRooms], all).state).toBe("open");
    expect(evaluate(zoneRow, "2026-09-05", [withRooms], all).state).toBe("unknown");
  });

  it("객실 데이터가 아직 없으면 객실 행은 모름이다", () => {
    const noRooms = bundle({ roomScan: undefined });
    expect(evaluate(roomRow, "2026-09-02", [noRooms], all).state).toBe("unknown");
  });

  it("일부 선택은 선택한 객실 중 열린 것이 하나라도 있으면 있음이다", () => {
    const partial = {
      [camp.id]: {
        "27": { mode: "some", rooms: ["485", "486"] } as ZoneSelection,
      },
    };
    const partialRows = buildRows(data, partial, {});
    expect(evaluate(partialRows[0], "2026-09-02", data, partial)).toEqual({
      state: "open",
      count: 1,
      amount: 140000,
    });
  });

  it("일부 선택인데 객실 조회에 실패한 날짜는 모름이다", () => {
    const partial = {
      [camp.id]: { "27": { mode: "some", rooms: ["485"] } as ZoneSelection },
    };
    const partialRows = buildRows(data, partial, {});
    expect(evaluate(partialRows[0], "2026-09-03", data, partial).state).toBe(
      "unknown",
    );
  });

  it("객실 데이터가 아직 없으면 일부 선택은 판단을 보류한다", () => {
    const partial = {
      [camp.id]: { "27": { mode: "some", rooms: ["485"] } as ZoneSelection },
    };
    const noRooms = bundle({ roomScan: undefined });
    const partialRows = buildRows([noRooms], partial, {});
    expect(
      evaluate(partialRows[0], "2026-09-02", [noRooms], partial).state,
    ).toBe("unknown");
  });
});

describe("summarizeDays", () => {
  const data = [bundle()];
  const rows = buildRows(data, all, {});

  it("열린 행이 하나라도 있으면 그 날은 있음이다", () => {
    expect(
      summarizeDays(["2026-09-02", "2026-09-03", "2026-09-04"], rows, data, all),
    ).toEqual([
      { date: "2026-09-02", open: true, unknown: false },
      { date: "2026-09-03", open: true, unknown: false },
      { date: "2026-09-04", open: true, unknown: false },
    ]);
  });

  it("모름인 행이 있으면 모름 표시가 켜진다", () => {
    expect(summarizeDays(["2026-09-05"], rows, data, all)[0]).toEqual({
      date: "2026-09-05",
      open: false,
      unknown: true,
    });
  });

  it("예약 기간 밖 날짜는 없음이다", () => {
    expect(summarizeDays(["2026-11-01"], rows, data, all)[0]).toEqual({
      date: "2026-11-01",
      open: false,
      unknown: false,
    });
  });
});
