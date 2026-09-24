import { describe, expect, it } from "vitest";

import { parseAsan } from "@/lib/providers/asanfmc";
import { parseGmuc } from "@/lib/providers/gmuc";
import { parseHuyangCalendar, parseHuyangDay } from "@/lib/providers/huyang";
import { remaining } from "@/lib/providers/gtdc";
import { parseMakeTicket } from "@/lib/providers/maketicket";
import { parseActDate } from "@/lib/providers/moonhwain";
import { parseSuseong } from "@/lib/providers/suseong";
import { parseUljuDay } from "@/lib/providers/ulju";
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

describe("remaining (강릉 연곡)", () => {
  const zones = [
    { id: "1", name: "A-대형데크", total: 53 },
    { id: "4", name: "D-카라반", total: 9 },
  ];

  it("찬 수(block)를 구역 전체에서 빼 남은 수로 바꾸고, 날짜를 20YY 로 편다", () => {
    expect(remaining(zones, { "26-09-28": { "1": "26", "4": "9" }, "26-10-03": { "1": "53" } })).toEqual({
      "2026-09-28": { "1": 27, "4": 0 },
      "2026-10-03": { "1": 0, "4": 9 },
    });
  });

  it("block 이 비면(빈 배열) 예약 받는 날이 없다", () => {
    expect(remaining(zones, [])).toEqual({});
  });
});

describe("parseSuseong (대구 진밭골)", () => {
  const html = `
    <td > <ul class="state_w"> </ul> </td>
    <td > <ul class="state_w"> 1 <li><p>카라반</p> <div> <span class="green" data-id="2026-10-1" data-origin-value="2"> 2</span></div></li>
      <li><p>데크</p> <div> <span class="red" style="cursor: pointer; pointer-events: auto;" data-id="2026-10-1" data-origin-value="0"> 0</span></div></li> </ul> </td>`;

  it("날마다 구역별 남은 수(data-origin-value)를 읽고 날짜를 두 자리로 편다", () => {
    expect(parseSuseong(html)).toEqual({ "2026-10-01": { "카라반": 2, "데크": 0 } });
  });
});

describe("parseAsan (아산 곡교천)", () => {
  const cell = (date: string, state: string) =>
    `<!-- 2026-10-18 < ${date} = n --> <span class="day"> <span class="sType ${state}"></span></span>`;
  const html = `
    <div class="titTd sticky"> 사이트면 </div>
    <div class="titTd"> A1(퍼컬러사이트) </div> <div class="titTd"> B1 </div>
    <div class="dayGroup sticky day31"> <span class="day">01</span> </div>
    <div class="dayGroup day31">${cell("2026-10-01", "one")}${cell("2026-10-05", "four")}${cell("2026-10-06", "two")}</div>
    <div class="dayGroup day31">${cell("2026-10-01", "three")}${cell("2026-10-05", "four")}${cell("2026-10-06", "one")}</div>`;

  it("사이트 × 날짜를 읽어 예약가능만 빈 것으로 두고, 전부 휴관인 날은 뺀다", () => {
    expect(parseAsan(html)).toEqual({
      sites: ["A1(퍼컬러사이트)", "B1"],
      days: {
        "2026-10-01": { "A1(퍼컬러사이트)": true, B1: false },
        "2026-10-06": { "A1(퍼컬러사이트)": false, B1: true },
      },
    });
  });
});

describe("huyang (정선 동강전망·화암약수)", () => {
  it("달력에서 예약을 받는 날(open)만 읽는다", () => {
    const html = `<li class="month">2026년 9월</li>
      <td class="close"><span class="day day_none">25</span></td>
      <td class="open"><span class="day day_none">26</span><form action="reservation.asp?location=002_01"></form></td>
      <form method="post" action="/reservation.asp?location=002" name="form_next"></form>`;
    expect(parseHuyangCalendar(html)).toEqual({ open: ["2026-09-26"], hasNext: true });
  });

  it("날짜 목록에서 이름 칸만 읽고 요금 칸은 세지 않는다", () => {
    const html = `<table class="res_facility_list_t"><tr><th>시설명</th></tr>
      <tr> <td>데크44</td> <td>30,000원</td> <td>40,000원</td> <td>40,000원</td> <td><form action="/reservation.asp?location=002_02"></form></td> </tr>
      <td>데크45</td> <td>30,000원</td> <td>40,000원</td> <td>40,000원</td> <td><form action="/reservation.asp?location=002_02"></form></td> </tr>
      </table>`;
    expect(parseHuyangDay(html)).toEqual(["데크44", "데크45"]);
  });

  it("빈 사이트가 없다는 경고는 없음이고, 목록도 경고도 없으면 실패다", () => {
    expect(parseHuyangDay(`<script>alert("예약 가능한 시설이 없습니다.")</script>`)).toEqual([]);
    expect(() => parseHuyangDay("<html></html>")).toThrow();
  });
});

describe("parseUljuDay (울주)", () => {
  it("사이트마다 구역·이름·예약 가능 여부를 읽는다", () => {
    const body = {
      result: "ok",
      list: [
        { CAMP_ID: "C0000090", NAME: "(일반)1.배롱나무", FACILITY_NAME: "카라반(일반) ", ISRESERVABLE: "Y" },
        { CAMP_ID: "C0000091", NAME: "(일반)2.이팝나무", FACILITY_NAME: "카라반(일반) ", ISRESERVABLE: "N" },
      ],
    };
    expect(parseUljuDay(body)).toEqual([
      { id: "C0000090", name: "(일반)1.배롱나무", zone: "카라반(일반)", open: true },
      { id: "C0000091", name: "(일반)2.이팝나무", zone: "카라반(일반)", open: false },
    ]);
  });

  it("조회 범위 밖(booking_ended)과 목록 없음은 빈 목록이고, 그 밖의 답은 실패다", () => {
    expect(parseUljuDay({ result: "booking_ended", msg: "예약은 현재 달과 다음 달까지만 조회 가능합니다." })).toEqual([]);
    expect(parseUljuDay({ result: "no_list" })).toEqual([]);
    expect(() => parseUljuDay({ result: "error" })).toThrow();
  });
});
