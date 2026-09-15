import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkInDates } from "@/lib/scan";

const window = { start: "2026-09-02", end: "2026-10-31", maxStay: 3, minStay: 1 };

describe("checkInDates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T09:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("오늘보다 이른 날짜는 버린다", () => {
    expect(checkInDates(window).at(0)).toBe("2026-09-10");
  });

  it("예약 기간이 아직 시작 전이면 시작일부터다", () => {
    expect(checkInDates({ ...window, start: "2026-09-20" }).at(0)).toBe("2026-09-20");
  });

  it("예약 마감일까지 전부 묻는다 — 숙박일수로 끝을 당기지 않는다", () => {
    expect(checkInDates(window).at(-1)).toBe("2026-10-31");
  });

  it("예약 기간이 이미 지났으면 빈 배열이다", () => {
    expect(checkInDates({ ...window, end: "2026-09-05" })).toEqual([]);
  });
});
