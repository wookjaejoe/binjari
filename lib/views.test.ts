import { describe, expect, it } from "vitest";

import { VIEWS, normalizeView } from "@/lib/views";

describe("normalizeView", () => {
  it("아는 값은 그대로 둔다", () => {
    for (const view of VIEWS) expect(normalizeView(view.value)).toBe(view.value);
  });

  it("사라진 보기 이름은 첫 보기로 되돌린다", () => {
    // 이전 버전에 있던 "month"가 저장된 채 남으면 아무 화면도 렌더되지 않았다.
    expect(normalizeView("month")).toBe("heat");
    expect(normalizeView("calendar")).toBe("heat");
  });

  it("값이 없거나 엉뚱해도 화면은 나와야 한다", () => {
    for (const value of [undefined, null, "", 0, {}, []]) {
      expect(normalizeView(value)).toBe("heat");
    }
  });
});
