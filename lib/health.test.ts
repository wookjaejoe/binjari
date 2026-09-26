import { describe, expect, it } from "vitest";

import { sampleDates, shapeProblems } from "@/lib/health";
import type { Zone } from "@/lib/providers/types";

const zone = (no: string, total = 10): Zone => ({
  no,
  name: `구역${no}`,
  total,
  size: "",
  maxPeop: 0,
  order: 0,
  photo: null,
  ground: "",
});

describe("shapeProblems", () => {
  it("맞는 모양이면 아무것도 적지 않는다", () => {
    expect(shapeProblems({ zones: [zone("a")], counts: { a: 3 }, amounts: {} }, "d", 1)).toEqual([]);
  });

  it("응답 없음·구역 없음·1박인데 물을 길 없음", () => {
    expect(shapeProblems(null, "d", 1)).toEqual(["d: 응답 없음"]);
    expect(shapeProblems({ zones: [], counts: {}, amounts: {} }, "d", 1)).toEqual(["d: 구역 없음"]);
    expect(shapeProblems({ zones: [zone("a")], counts: {}, amounts: {}, unanswered: true }, "d", 1)).toEqual([
      "d: 1박을 물을 길 없음",
    ]);
  });

  it("2박이 물을 길 없음인 것은 모양이 맞다", () => {
    expect(shapeProblems({ zones: [zone("a")], counts: {}, amounts: {}, unanswered: true }, "d", 2)).toEqual([]);
  });

  it("남은 수가 비었거나 음수이거나 전체보다 많으면 적는다", () => {
    const day = { zones: [zone("a"), zone("b"), zone("c", 5)], counts: { b: -1, c: 6 }, amounts: {} };
    expect(shapeProblems(day, "d", 1)).toEqual([
      "d: 구역a 남은 수 undefined",
      "d: 구역b 남은 수 -1",
      "d: 구역c 남은 수 6 > 전체 5",
    ]);
  });

  it("전체를 모르는 구역(0)은 남은 수를 견주지 않는다", () => {
    expect(shapeProblems({ zones: [zone("a", 0)], counts: { a: 40 }, amounts: {} }, "d", 1)).toEqual([]);
  });
});

describe("sampleDates", () => {
  // 2026-09-26(토)부터 30일
  const dates = Array.from({ length: 30 }, (_, i) =>
    new Date(Date.UTC(2026, 8, 26 + i)).toISOString().slice(0, 10),
  );

  it("첫 날과, 일주일 뒤부터 이레", () => {
    expect(sampleDates(dates)).toEqual({
      first: "2026-09-26",
      week: ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
    });
  });

  it("기간이 짧으면 있는 만큼만", () => {
    expect(sampleDates(dates.slice(0, 9))).toEqual({ first: "2026-09-26", week: ["2026-10-03", "2026-10-04"] });
    expect(sampleDates(dates.slice(0, 2))).toEqual({ first: "2026-09-26", week: [] });
    expect(sampleDates([])).toBeNull();
  });
});
