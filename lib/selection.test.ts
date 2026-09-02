import { describe, expect, it } from "vitest";

import { buildValidMap, reconcileSelection, type Selection } from "@/lib/selection";
import type { CampProfile, CampStatus, ZoneScan } from "@/lib/types";

const all = { mode: "all" } as const;

function camp(id: string, status: CampStatus): CampProfile {
  return {
    id,
    name: id,
    portalId: "gwgs",
    portalLabel: "고성군",
    window:
      status === "unopened"
        ? null
        : { start: "2026-09-02", end: "2026-10-31", minStay: 1, maxStay: 7 },
    status,
    zoneCount: 0,
    roomCount: 0,
  };
}

function scan(campId: string, zoneNos: string[]): ZoneScan {
  return {
    campId,
    campName: campId,
    nights: 1,
    window: { start: "2026-09-02", end: "2026-10-31", minStay: 1, maxStay: 7 },
    tooManyNights: false,
    dates: [],
    zones: zoneNos.map((no) => ({
      no,
      name: `구역 ${no}`,
      total: 2,
      size: "",
      maxPeop: 4,
      order: 1,
    })),
    counts: {},
    amounts: {},
    failedDates: [],
    generatedAt: "2026-09-02T00:00:00.000Z",
  };
}

describe("buildValidMap", () => {
  it("조회에 실패한 캠핑장은 판단을 보류한다 — 실패로 선택을 지우면 안 된다", () => {
    const map = buildValidMap([camp("a", "unknown")], new Map());
    expect(map).toEqual({ a: "unknown" });

    // 그래서 선택도 그대로 남아야 한다.
    const current: Selection = { a: { "1": all } };
    expect(reconcileSelection(current, map)).toBeNull();
  });

  it("운영 전으로 확정된 캠핑장은 지도에서 빼 선택을 정리한다", () => {
    const camps = [camp("prep", "preparing"), camp("closed", "unopened")];
    expect(buildValidMap(camps, new Map())).toEqual({});

    const current: Selection = { prep: { "30": all }, closed: {} };
    expect(reconcileSelection(current, buildValidMap(camps, new Map()))).toEqual({});
  });

  it("구역 스캔이 도착한 캠핑장만 구역 목록으로 좁힌다", () => {
    const camps = [camp("a", "open"), camp("b", "open")];
    const scans = new Map([["a", scan("a", ["1", "2"])]]);
    expect(buildValidMap(camps, scans)).toEqual({ a: ["1", "2"], b: "unknown" });
  });
});

describe("reconcileSelection", () => {
  it("정리할 게 없으면 null — 호출자가 상태를 건드리지 않아야 렌더 루프가 없다", () => {
    const current: Selection = { camp: { "1": all, "2": all } };
    expect(reconcileSelection(current, { camp: ["1", "2"] })).toBeNull();
  });

  it("운영이 멈춘 캠핑장은 버린다", () => {
    const current: Selection = { open: { "1": all }, closed: { "9": all } };
    expect(reconcileSelection(current, { open: ["1"] })).toEqual({
      open: { "1": all },
    });
  });

  it("선택만 남고 실제로는 사라진 구역을 버린다", () => {
    const current: Selection = { camp: { "1": all, "999": all } };
    expect(reconcileSelection(current, { camp: ["1"] })).toEqual({
      camp: { "1": all },
    });
  });

  it("구역이 전부 사라지면 캠핑장 자체를 비운다 — 빈 객체가 남으면 개수가 부풀려진다", () => {
    const current: Selection = { camp: { "30": all } };
    expect(reconcileSelection(current, { camp: [] })).toEqual({});
  });

  it("이미 들어 있는 빈 객체도 정리한다", () => {
    const current: Selection = { camp: {} };
    expect(reconcileSelection(current, { camp: ["1"] })).toEqual({});
  });

  it("구역 목록이 아직 없으면 판단을 보류하고 그대로 둔다", () => {
    const current: Selection = { camp: { "1": all, "999": all } };
    expect(reconcileSelection(current, { camp: "unknown" })).toBeNull();
  });

  it("객실을 일부만 고른 상태를 유지한다", () => {
    const partial: Selection = {
      camp: { "27": { mode: "some", rooms: ["477"] } },
    };
    expect(reconcileSelection(partial, { camp: ["27"] })).toBeNull();
  });
});
