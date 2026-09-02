import { describe, expect, it } from "vitest";

import { reconcileSelection, type Selection } from "@/lib/selection";

const all = { mode: "all" } as const;

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
