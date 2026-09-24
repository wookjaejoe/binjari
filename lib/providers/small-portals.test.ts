import { describe, expect, it } from "vitest";

import { parseGmuc } from "@/lib/providers/gmuc";
import { parseMakeTicket } from "@/lib/providers/maketicket";
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

describe("parseGmuc (광명 도덕산)", () => {
  const html = `
    <table class='view'><tbody>
    <tr class="trBefore"> <td></td>
      <td> <div class="date">25</div>
        <div class="area_done"><a href="javascript:alert('예약은 내일 날짜 부터 할 수 있습니다.');">A구역 : 예약마감</a></div>
        <div class="area_done"><a href="javascript:alert('예약은 내일 날짜 부터 할 수 있습니다.');">B구역 : 예약마감</a></div> </td>
      <td> <div class="date">26</div>
        <div class="area"><a href="/user/conn/directLink.do?cTo=x" target='_blank'>A구역 : 0</a></div>
        <div class="area"><a href="/user/conn/directLink.do?cTo=x" target='_blank'>B구역 : 17</a></div> </td>
    </tr>
    <tr class="trAfter"> <td> <div class="date">1</div>
        <div class="area"><a href="/user/conn/directLink.do?cTo=x" target='_blank'>A구역 : 19</a></div> </td>
    </tr></tbody></table>
    <script> function calCont(flag){ if("20261001"!=null&&"20261001"!=""){ if(flag=="btnBefore"){
      $("#reservDate").text("2026년 9월(예약현황)"); } else if(flag=="btnAfter"){
      $("#reservDate").text("2026년 10월(예약현황)"); } } }</script>`;

  it("이번 달·다음 달 줄을 날짜별 구역 남은 수로 읽고, 예약마감인 날은 뺀다", () => {
    expect(parseGmuc(html)).toEqual({
      "2026-09-26": { "A구역": 0, "B구역": 17 },
      "2026-10-01": { "A구역": 19 },
    });
  });

  it("달력이 없으면 실패다", () => {
    expect(() => parseGmuc("<html></html>")).toThrow();
  });
});

describe("parseMakeTicket (스마틱스 Forest)", () => {
  const html = `
    <td class="nmo"><span></span></td>
    <td class="active" id="calendar_1"> <strong>1</strong> <ul>
      <li class='s1'><a href='#' onclick='javascript:f_SelectDateZone( "20261001" , "CM000172" , "SD69104" , "3" , "7" );'><span>7</span>오토캠핑</a></li><li class='s2 zero'><a href='#' onclick='javascript:f_SelectDateZone( "20261001" , "CM000173" , "SD69104" , "4" , "0" );'><span>0</span>텐트</a></li>
    </ul></td>
    <td class="active" id="calendar_2"> <strong>2</strong> </td>`;

  it("날짜 × 구역의 남은 수를 읽고, 구역이 없는 날은 뺀다", () => {
    expect(parseMakeTicket(html)).toEqual({
      "2026-10-01": {
        CM000172: { name: "오토캠핑", left: 7 },
        CM000173: { name: "텐트", left: 0 },
      },
    });
  });
});
