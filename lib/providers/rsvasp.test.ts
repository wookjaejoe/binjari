import { describe, expect, it } from "vitest";

import { openFor, parseCalendar, parseZones } from "@/lib/providers/rsvasp";

// 상소오토캠핑장 모양: 구역은 셀렉트, 날짜는 rsv_day, 빈 사이트는 폼 버튼(rsv_ok).
const SANGSO = `
<div class="rsv_state"><ul><li class="first"><strong>2026년 9월</strong>
<form method="post" action="/reservation.asp?location=002" name="form_next"><input type="hidden" value="10" name="wh_month" /></form></li>
<li><select name="man" title="캠핑장 구역 선택">
  <option value="1" selected="selected">A구역(파쇄석)</option>
  <option value="4">D구역<!--(데크)-->(파쇄석)</option>
</select></li>
<li class="last"><img src="/images/reservation/ok.gif" alt="예약가능" /> : 예약가능*</li></ul></div>
<table class="calendar_t"><tbody><tr><th>일(SUN)</th></tr>
<tr><td class="sun no_day">&nbsp;</td><td><span class="rsv_day">1</span><p class="rsv_no">예약종료</p></td>
<td><span class="rsv_day">27</span><br /><span class="rsv_facility"><img src="/images/reservation/no.gif" alt="예약완료" />A구역01</span><br /><form action="reservation.asp?location=002_02" method="post" name="form0"><input type="hidden" name="rsv_info" value="A#@3002#@2026-09-27#@2026-09-28#@0#@0" /><button type="submit" class="rsv_ok"><img src="/images/reservation/ok.gif" alt="예약가능" />A구역02 *</button></form></td>
<td><span class="rsv_day">28</span><br /><form action="reservation.asp?location=002_02" method="post" name="form1"><button type="submit" class="rsv_ok"><img src="/images/reservation/ok.gif" alt="예약가능" />A구역01 *</button></form><form action="reservation.asp?location=002_02" method="post" name="form2"><button type="submit" class="rsv_ok"><img src="/images/reservation/ok.gif" alt="예약가능" />A구역02 *</button></form></td></tr>
</tbody></table>`;

// 지경 국민여가캠핑장 모양: 구역은 탭 버튼 폼, 날짜는 셀 첫 글자, 끝난 사이트는 rsv_no.
const JIGYEONG = `
<div class="rsv_select"><span class="date">2026년 10월</span></div>
<div class="util_title">
<form method="post" name="form" action="/reservation.asp?location=002"><fieldset><input type="hidden" value="2026" name="wh_year" /><input type="hidden" value="10" name="wh_month" /><input type="hidden" value="1" name="man" /><input type="hidden" value="" name="whorun" /><button type="submit" class="sbtn_1_on">캐라반</button></fieldset></form>
<form method="post" name="form" action="/reservation.asp?location=002"><fieldset><input type="hidden" value="2026" name="wh_year" /><input type="hidden" value="10" name="wh_month" /><input type="hidden" value="2" name="man" /><input type="hidden" value="" name="whorun" /><button type="submit" class="sbtn_2">오토캠핑장</button></fieldset></form>
<img src="/images/reservation/wan.gif" alt="예약완료" /> 예약완료
</div>
<table class="calendar"><tbody>
<tr><td>1<br /><span class="rsv_no"><img src="/images/reservation/wan.gif" alt="예약완료" />캐라반1</span><br /><form><button class="rsv_ok"><img src="/images/reservation/icon1.jpg" alt="예약가능" />캐라반2</button></form></td><td>2<br /><span class="rsv_no">예약종료</span></td></tr>
</tbody></table>`;

describe("parseZones", () => {
  it("셀렉트에서 구역을 읽고 주석은 뺀다", () => {
    expect(parseZones(SANGSO)).toEqual([
      { man: "1", name: "A구역(파쇄석)" },
      { man: "4", name: "D구역(파쇄석)" },
    ]);
  });

  it("셀렉트가 없으면 탭 버튼 폼에서 읽는다", () => {
    expect(parseZones(JIGYEONG)).toEqual([
      { man: "1", name: "캐라반" },
      { man: "2", name: "오토캠핑장" },
    ]);
  });
});

describe("parseCalendar", () => {
  it("날짜마다 사이트가 비었는지 읽고, 예약종료인 날은 뺀다", () => {
    const month = parseCalendar(SANGSO);
    expect(month.month).toBe("2026-09");
    expect(month.hasNext).toBe(true);
    expect(month.days).toEqual({
      "2026-09-27": { "A구역01": false, "A구역02": true },
      "2026-09-28": { "A구역01": true, "A구역02": true },
    });
  });

  it("범례의 예약가능 그림은 날짜로 읽지 않는다", () => {
    const month = parseCalendar(JIGYEONG);
    expect(month.month).toBe("2026-10");
    expect(month.hasNext).toBe(false);
    expect(month.days).toEqual({ "2026-10-01": { "캐라반1": false, "캐라반2": true } });
  });
});

describe("openFor", () => {
  const days = {
    "2026-09-27": { a: true, b: true, c: false },
    "2026-09-28": { a: true, b: false, c: true },
    "2026-09-29": { a: true, b: true, c: true },
  };

  it("1박은 그 날 빈 사이트다", () => {
    expect(openFor(days, "2026-09-27", 1)).toEqual(["a", "b"]);
  });

  it("여러 박은 밤마다 빈 사이트만 남는다", () => {
    expect(openFor(days, "2026-09-27", 2)).toEqual(["a"]);
    expect(openFor(days, "2026-09-28", 2)).toEqual(["a", "c"]);
  });

  it("예약을 받지 않는 밤이 끼면 없다", () => {
    expect(openFor(days, "2026-09-29", 2)).toEqual([]);
  });

  it("포털이 받는 최대 박수(3박)를 넘기면 없다", () => {
    const long = { ...days, "2026-09-30": { a: true }, "2026-10-01": { a: true } };
    expect(openFor(long, "2026-09-27", 3)).toEqual(["a"]);
    expect(openFor(long, "2026-09-27", 4)).toEqual([]);
  });
});
