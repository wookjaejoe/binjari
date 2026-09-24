import { describe, expect, it } from "vitest";

import { parseGrid, roomDayOf, zoneDayOf } from "@/lib/providers/knps";

/** 실제 응답(campsiteList.do)의 뼈대를 줄인 것. 공백·숨긴 thead·툴팁 제목까지 그대로 둔다. */
const cell = (name: string, date: string, icon: string, code: string, amount?: number) =>
  `<td class=""><i title="${name} : ${date}" class="${icon} ${date.replaceAll("-", "")}_${code}"` +
  (amount ? ` data-reser_tp='${code}' data-prod-id='CB1' data-sal-amt='${amount}'` : "") +
  `></i>${amount ? "<script> var RCCntVal = 0; </script>" : ""}</td>`;

const open = (name: string, date: string, amount: number) =>
  cell(name, date, "icon-reservation", "N", amount);
const taken = (name: string, date: string) => cell(name, date, "icon-none-reservation", "C");
const closed = (name: string, date: string) => cell(name, date, "icon-end", "R");
const waiting = (name: string, date: string, amount: number) =>
  cell(name, date, "icon-waiting", "W", amount);

const HTML = `
<div class="table-reservation">
  <table class="table-sticky-head"><thead class="thead"><tr><th>야영장</th></tr></thead></table>
  <table class="table-head"><thead class="thead"><tr class="day"><td>25</td></tr></thead></table>
  <table class="table-sticky-body"><caption>시설명 및 영지 명</caption>
    <tbody class="tbody">
      <tr>
        <th rowspan="2" scope="row"><span class="title"> 자동차야영장 </span></th>
        <th scope="row"><i class="icon-electricity"></i><span class="title"> B01 </span></th>
      </tr>
      <tr><th scope="row"><span class="title tooltip"> B02(4인, 무공해영지) <span class="tooltip-text">B02(4인, 무공해영지)</span></span></th></tr>
      <tr>
        <th rowspan="1" scope="row"><span class="title"> 카라반 </span></th>
        <th scope="row"><span class="title"> A01(4인) </span></th>
      </tr>
    </tbody>
  </table>
  <table class="table-body">
    <thead style="display:none;"><tr><th>숨김</th></tr></thead>
    <tbody class="tbody">
      <tr>${open("B01", "2026-09-25", 20000)}${open("B01", "2026-09-26", 30000)}${closed("B01", "2026-09-27")}</tr>
      <tr>${open("B02", "2026-09-25", 25000)}${taken("B02", "2026-09-26")}${open("B02", "2026-09-27", 20000)}</tr>
      <tr>${waiting("A01", "2026-09-25", 75000)}${open("A01", "2026-09-26", 90000)}${open("A01", "2026-09-27", 75000)}</tr>
    </tbody>
  </table>
</div>`;

describe("parseGrid", () => {
  const grid = parseGrid(HTML);

  it("시설 묶음을 구역으로, 영지를 그 안의 객실로 읽는다", () => {
    expect(grid.zones).toEqual(["자동차야영장", "카라반"]);
    expect(grid.sites.map((site) => [site.zone, site.name])).toEqual([
      ["자동차야영장", "B01"],
      ["자동차야영장", "B02(4인, 무공해영지)"],
      ["카라반", "A01(4인)"],
    ]);
  });

  it("숨긴 thead 의 행을 영지로 세지 않는다", () => {
    expect(grid.sites).toHaveLength(3);
  });

  it("예약가능만 열린 칸이다 — 대기가능·예약만료·예약불가는 빈자리가 아니다", () => {
    expect(grid.sites[0].nights["2026-09-25"]).toEqual({ open: true, amount: 20000 });
    expect(grid.sites[0].nights["2026-09-27"].open).toBe(false);
    expect(grid.sites[1].nights["2026-09-26"].open).toBe(false);
    expect(grid.sites[2].nights["2026-09-25"].open).toBe(false);
  });

  it("표의 날짜가 곧 예약 기간이다", () => {
    expect(grid.dates).toEqual(["2026-09-25", "2026-09-26", "2026-09-27"]);
  });

  it("표가 없는 응답은 빈 기간이 아니라 실패다", () => {
    expect(() => parseGrid("<html>잠시 후 다시 시도</html>")).toThrow();
  });
});

describe("zoneDayOf", () => {
  const grid = parseGrid(HTML);

  it("1박은 그 날 예약가능한 영지 수, 요금은 그중 가장 싼 것", () => {
    const day = zoneDayOf(grid, "2026-09-25", 1);
    expect(day.counts).toEqual({ 자동차야영장: 2, 카라반: 0 });
    expect(day.amounts).toEqual({ 자동차야영장: 20000, 카라반: null });
    expect(day.zones.map((zone) => zone.total)).toEqual([2, 1]);
  });

  it("2박은 같은 영지가 이틀 연달아 예약가능해야 한다 — 요금은 두 밤의 합", () => {
    expect(zoneDayOf(grid, "2026-09-25", 2).counts).toEqual({ 자동차야영장: 1, 카라반: 0 });
    expect(zoneDayOf(grid, "2026-09-25", 2).amounts.자동차야영장).toBe(50000);
    expect(zoneDayOf(grid, "2026-09-26", 2).counts).toEqual({ 자동차야영장: 0, 카라반: 1 });
  });

  it("표 끝을 넘는 일정은 없음이다", () => {
    expect(zoneDayOf(grid, "2026-09-27", 2).counts).toEqual({ 자동차야영장: 0, 카라반: 0 });
  });

  it("3박 이상은 포털에 고를 길이 없으니 없음이다", () => {
    expect(zoneDayOf(grid, "2026-09-25", 3).counts).toEqual({ 자동차야영장: 0, 카라반: 0 });
  });
});

describe("roomDayOf", () => {
  const grid = parseGrid(HTML);

  it("구역의 영지를 전부 싣고 열린 것만 available 에 넣는다", () => {
    const day = roomDayOf(grid, "자동차야영장", "2026-09-26", 1);
    expect(day.rooms.map((room) => room.name)).toEqual(["B01", "B02(4인, 무공해영지)"]);
    expect(day.available).toEqual(["자동차야영장:B01"]);
  });

  it("예약 끝난 칸은 요금이 없으니 표에서 처음 보이는 요금을 적는다", () => {
    const day = roomDayOf(grid, "자동차야영장", "2026-09-26", 1);
    expect(day.rooms[1].amount).toBe(25000);
  });
});
