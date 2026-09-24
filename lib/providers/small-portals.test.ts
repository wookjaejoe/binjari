import { describe, expect, it } from "vitest";

import { parseAsan } from "@/lib/providers/asanfmc";
import { parseChangwonPage } from "@/lib/providers/changwon";
import { parseComeall, parseLiveStart } from "@/lib/providers/comeall";
import { parseDptoCalendar, parseDptoMap } from "@/lib/providers/dpto";
import { parseDssPage } from "@/lib/providers/dssiseol";
import { parseGhssList, parseGhssPage } from "@/lib/providers/ghss";
import { parseGmuc } from "@/lib/providers/gmuc";
import { parseHuyangCalendar, parseHuyangDay } from "@/lib/providers/huyang";
import { remaining } from "@/lib/providers/gtdc";
import { parseMakeTicket } from "@/lib/providers/maketicket";
import { parseActDate } from "@/lib/providers/moonhwain";
import { parseSuseong } from "@/lib/providers/suseong";
import { parseUljuDay } from "@/lib/providers/ulju";
import { parseYeongdoCalendar, parseYeongdoSites } from "@/lib/providers/yeongdo";
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

describe("당진도시공사", () => {
  it("달력에서 누를 수 있는 날만 읽는다", () => {
    const html = `<li class="noclick"><span class='sat_font'>1</span></li>
      <li onclick="Mapload('2026', '10', '02', this);Mapload2('2026', '10', '02', this);" ><span>2</span></li>`;
    expect(parseDptoCalendar(html)).toEqual(["2026-10-02"]);
  });

  it("배치도에서 빈 사이트와 끝난 사이트를 읽고, 주석 속 옛 구역·관리동은 세지 않는다", () => {
    const html = `<ul class="zone">
      <li><a class="done" href="javascript:void(0);"><span>D-4</span></a></li>
      <li><a class="cook" href="javascript:void(0);">취사장</a></li>
      <li><a onclick="siteInfoLoad('2026-10-02', 'C-3', this)" href="javascript:void(0);">C-3</a></li>
      <li><a href="javascript:void(0);">C-6</a></li>
      <!-- <li><a onclick="siteInfoLoad('2026-10-02', '왜목7', this)" href="javascript:void(0);">왜목-7</a></li> -->
    </ul>`;
    expect(parseDptoMap(html)).toEqual({ "C-3": true, "D-4": false });
  });
});

describe("낙동강 캠핑장 (부산 대저·삼락)", () => {
  const site = (state: string, id: string, zone: string, name: string) =>
    `<a href="" class="cbtn area_${zone.toLowerCase()} cbtn_${name} ${state} tooltip ">${name}
      <input type="hidden" class="siteid" value="${id}"> <input type="hidden" class="sitetype" value="${zone}">
      <input type="hidden" class="sitename" value="${name}"> <input type="hidden" class="site_price" value="23000"> </a>`;

  it("사이트마다 구역과 상태를 읽고, 예약가능(cbtn_on)만 빈 것으로 본다", () => {
    const html = site("cbtn_on", "212", "A", "01") + site("cbtn_Pcancel", "214", "A", "03") + site("cbtn_Pcomplete", "300", "D", "12");
    expect(parseComeall(html)).toEqual([
      { id: "212", zone: "A", name: "A-01", open: true },
      { id: "214", zone: "A", name: "A-03", open: false },
      { id: "300", zone: "D", name: "D-12", open: false },
    ]);
  });

  it("화면 스크립트에서 예약 시작 시각을 읽는다", () => {
    const html = `const LIVE_START_DAY = parseInt('5'); // 라이브 시작 일 const LIVE_START_HOUR = parseInt('11');`;
    expect(parseLiveStart(html)).toEqual({ day: 5, hour: 11 });
  });
});

describe("parseChangwonPage (창원 달천)", () => {
  it("구역 정원·찬 날·CSRF 토큰을 읽는다", () => {
    const html = `<input type="hidden" name="CSRFToken" value="abc-123" />
      <td><span class="fwb" id="siteCount"></span> /26</td> <td><span class="fwb" id="caravanCount"></span> /4</td>
      <td><span class="fwb" id="bgCount"></span> /4</td>
      <script> fn_finishday_push("2026-10-03"); fn_finishday_push("2026-10-04"); </script>`;
    const page = parseChangwonPage(html);
    expect(page.csrf).toBe("abc-123");
    expect(page.totals).toEqual({ siteCount: 26, caravanCount: 4, bgCount: 4 });
    expect([...page.finished]).toEqual(["2026-10-03", "2026-10-04"]);
  });
});

describe("parseDssPage (달성 구지·강변)", () => {
  it("마지막 체크인 날과 구역 셀렉트를 읽는다", () => {
    const html = `<select id="acmdt_fclt_clsf_id" name="acmdt_fclt_clsf_id" title="캐라반 선택" class="select required">
        <option value="DSS_ACMDT_FCLT_CLSF_00000001" selected="selected">캐라반 8인(낙동)</option>
        <option value="DSS_ACMDT_FCLT_CLSF_00000002">캐라반 6인(달성)</option> </select>
      <script> var maxStartDate = new Date('2026-10-31'); </script>`;
    expect(parseDssPage(html)).toEqual({
      lastCheckIn: "2026-10-31",
      zones: [
        { id: "DSS_ACMDT_FCLT_CLSF_00000001", name: "캐라반 8인(낙동)" },
        { id: "DSS_ACMDT_FCLT_CLSF_00000002", name: "캐라반 6인(달성)" },
      ],
    });
  });
});

describe("영도 마리노", () => {
  it("달력에서 예약을 받는 날(able-apply)만 읽는다", () => {
    const html = `<td class="unselect date-td" id="date24" data-index="23" data-date-string="2026-09-24"></td>
      <td class="able-apply date-td" id="date25" data-index="24" data-date-string="2026-09-25"></td>`;
    expect(parseYeongdoCalendar(html)).toEqual(["2026-09-25"]);
  });

  it("사이트 목록에서 예약가능(siteCode)과 예약불가(unselect)를 가른다", () => {
    const html = `<ol class="autosite"> <li class="unselect n1"> <button type="button" class="b1" title="예약불가" disabled="disabled" }>오토 1</button> </li>
      <li class="siteCode n3" id="siteCodeS203" data-site-code="S203" data-site-title="3번"> <button type="button" class="b1" title="예약가능"> 오토 3 </button> </li></ol>`;
    expect(parseYeongdoSites(html)).toEqual({ "오토 1": false, "오토 3": true });
  });
});

describe("강화 함허동천", () => {
  it("예약 화면에서 기간(after_day·finish_date)·구역·운영중지 기간을 읽는다", () => {
    const html = `<select id="fcgp_id" name="fcgp_id"> <option value="">전체</option> <option value="CAMP1TH">제1야영장</option> </select>
      <script> var after_day = 2; var finish_date = '2026-11-01';
      var dateRanges = [{ 'start': '2026-10-12', 'end': '2026-10-13' }]; </script>`;
    expect(parseGhssPage(html, "2026-09-25")).toEqual({
      start: "2026-09-27",
      lastCheckIn: "2026-10-31",
      zones: [{ id: "CAMP1TH", name: "제1야영장" }],
      stops: [{ start: "2026-10-12", end: "2026-10-13" }],
    });
  });

  it("쪽마다 결제금액과 전체 쪽 수를 읽는다", () => {
    const html = `<dd>결제금액 : 33,000원</dd> <dd>결제금액 : 35,000원</dd> <script> totalPageCount = 6; </script>`;
    expect(parseGhssList(html)).toEqual({ amounts: [33000, 35000], pages: 6 });
  });
});
