import { describe, expect, it } from "vitest";

import { parseActDate } from "@/lib/providers/moonhwain";
import { parseYesanCalendar } from "@/lib/providers/yesan";

describe("parseActDate (문화인)", () => {
  it("숨은 actDate 값을 날짜별 남은 수로 읽는다", () => {
    const html = `<input type="hidden" id="actDate" name="actDate" value="20260927:0,20260928:11,20261031:3," />`;
    expect(parseActDate(html)).toEqual({ "2026-09-27": 0, "2026-09-28": 11, "2026-10-31": 3 });
  });

  it("값이 없으면 빈 기간이 아니라 실패다", () => {
    expect(() => parseActDate("<html></html>")).toThrow();
  });
});

describe("parseYesanCalendar (예산 예당)", () => {
  const html = `
    <td class="off"><div class="calendar-list__day"><span>30</span></div></td>
    <td class="possible " data-search-bgng-dt="2026-10-01"><ul class="re-wrap">
      <li class="site a"><a class="link" data-fclty-se="A" title="A구역"><span class="num">3개</span> 예약가능</a></li>
      <li class="site b"><a class="link" data-fclty-se="B" title="B구역"><span class="num">17개</span> 예약가능</a></li>
    </ul></td>
    <td class="possible saturday sat " data-search-bgng-dt="2026-10-03"><ul class="re-wrap">
      <li class="site a imp"><span class="link"><span class="num">0개</span> 예약마감</span></li>
      <li class="site b"><a class="link" title="B구역"><span class="num">2개</span> 예약가능</a></li>
    </ul></td>`;

  it("예약 받는 날만, 구역별 남은 수로 읽는다 — 예약마감은 0", () => {
    expect(parseYesanCalendar(html)).toEqual({
      "2026-10-01": { A구역: 3, B구역: 17 },
      "2026-10-03": { A구역: 0, B구역: 2 },
    });
  });
});
