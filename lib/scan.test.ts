import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkInDates } from "@/lib/scan";

const window = { start: "2026-09-02", end: "2026-10-31", minStay: 1, maxStay: 7 };

describe("checkInDates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T09:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("오늘보다 이른 날짜는 버린다", () => {
    expect(checkInDates(window, 1).at(0)).toBe("2026-09-10");
  });

  it("1박은 예약 마감일까지 체크인할 수 있다", () => {
    expect(checkInDates(window, 1).at(-1)).toBe("2026-10-31");
  });

  it("연박은 체크아웃이 마감일 다음날을 넘지 않도록 줄인다", () => {
    expect(checkInDates(window, 2).at(-1)).toBe("2026-10-30");
    expect(checkInDates(window, 7).at(-1)).toBe("2026-10-25");
  });

  it("예약 기간이 이미 지났으면 빈 배열이다", () => {
    expect(
      checkInDates({ ...window, end: "2026-09-05" }, 1),
    ).toEqual([]);
  });
});
