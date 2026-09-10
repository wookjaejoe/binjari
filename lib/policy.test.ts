import { describe, expect, it } from "vitest";

import { fillScale } from "@/lib/policy";

const levels = (values: number[]) => values.map(fillScale(values));

describe("fillScale", () => {
  it("0 이하는 마감이다", () => {
    const shade = fillScale([1, 2, 3]);
    expect(shade(0)).toBe(0);
    expect(shade(-1)).toBe(0);
  });

  it("가장 작은 값은 1단, 가장 큰 값은 4단", () => {
    expect(levels([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("값이 한 종류뿐이면 비교할 것이 없으므로 모두 4단", () => {
    expect(levels([5, 5, 5, 5])).toEqual([4, 4, 4, 4]);
  });

  it("빈 목록이어도 터지지 않는다", () => {
    expect(fillScale([])(3)).toBe(4);
  });

  it("한 값이 아무리 반복돼도 나머지 값이 눌리지 않는다", () => {
    // 빈도가 아니라 값의 종류로 나누므로 1이 몇 개든 4는 최고단에 남는다.
    const values = [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4];
    expect(levels(values)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4]);
  });

  it("고정 구간이던 시절의 포화가 재현되지 않는다", () => {
    // 구역 6개를 선택하면 "열린 구역 수"는 1..6뿐이라 고정 비율 구간
    // (0.75↑=4단, 0.4↑=3단, 0.15↑=2단)에서는 1단이 도달 불가였고
    // 대부분의 날이 4단으로 몰렸다. 이제 네 단계가 모두 쓰인다.
    const openUnits = [1, 2, 3, 4, 5, 6];
    const used = new Set(levels(openUnits));
    expect([...used].sort()).toEqual([1, 2, 3, 4]);
  });

  it("이상치가 있어도 아래쪽 값들이 한 단계로 뭉치지 않는다", () => {
    expect(levels([1, 2, 3, 100])).toEqual([1, 2, 3, 4]);
  });
});
