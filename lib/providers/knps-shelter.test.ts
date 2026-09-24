import { describe, expect, it } from "vitest";

import { parseShelterGrid, shelterDayOf } from "@/lib/providers/knps-shelter";

/** tabShelter.do 응답의 뼈대. 예약만료 칸에는 날짜가 없고, 칸 사이에 script 가 끼어 있다. */
const open = (name: string, date: string, left: number, max: number, price: number) =>
  `<td id="tdSch1" class=" "><i class="icon-reservation" title="예약가능:${left}" data-reser_tp="R" ` +
  `data-fclt-nm="${name}" data-dept-id="B011001" data-use_dt="${date}" data-max_cnt="${max}" ` +
  `data-price="${price}" data-rsvt-cnt="${left}"></i></td><script> var RCCntVal = 0; </script>`;
const expired = `<td class=" "><i class="icon-none-reservation" title="예약만료"></i></td>`;
const waiting = (name: string, date: string) =>
  `<td class=" "><i class="icon-waiting" title="대기가능:1" data-reser_tp="W" data-fclt-nm="${name}" ` +
  `data-use_dt="${date}" data-max_cnt="7" data-price="20000"></i></td>`;

const HTML = `
<table class="table-head"><thead class="thead">
  <tr><th colspan="2" scope="col"><span>09월</span></th><th colspan="1" scope="col"><span>10월</span></th></tr>
  <tr class="day"><td class="">29</td><td class="">30</td><td class="border-first-day">01</td></tr>
</thead></table>
<table class="table-sticky-body"><caption>대피소 시설</caption><tbody class="tbody">
  <tr><th scope="row" rowspan="2"> 지리산경남 </th><th scope="row" class="tbl_point"> 벽소령대피소 </th></tr>
  <tr><th scope="row" class="tbl_point"> 세석대피소 </th></tr>
</tbody></table>
<table class="table-body"><thead style="display:none;"><tr><th>x</th></tr></thead><tbody class="tbody">
  <tr>${expired}${open("벽소령대피소", "20260930", 37, 70, 20000)}${waiting("벽소령대피소", "20261001")}</tr>
  <tr>${open("세석대피소", "20260929", 5, 120, 20000)}${expired}${open("세석대피소", "20261001", 90, 120, 30000)}</tr>
</tbody></table>`;

describe("parseShelterGrid", () => {
  const grid = parseShelterGrid(HTML);

  it("날짜 없는 예약만료 칸이 첫 열이어도 날짜를 맞춘다", () => {
    expect(grid.dates).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
  });

  it("대피소가 구역이고, 정원은 예약가능 칸의 data-max_cnt 다", () => {
    expect(grid.shelters.map((s) => [s.name, s.capacity])).toEqual([
      ["벽소령대피소", 70],
      ["세석대피소", 120],
    ]);
  });

  it("예약가능만 열린 칸이고 남은 자리를 센다 — 대기가능은 없음", () => {
    const day = shelterDayOf(grid, "2026-09-30", 1);
    expect(day.counts).toEqual({ 벽소령대피소: 37, 세석대피소: 0 });
    expect(shelterDayOf(grid, "2026-10-01", 1).counts).toEqual({ 벽소령대피소: 0, 세석대피소: 90 });
  });

  it("2박 이상은 고를 길이 없으니 없음이다", () => {
    expect(shelterDayOf(grid, "2026-09-30", 2).counts).toEqual({ 벽소령대피소: 0, 세석대피소: 0 });
  });

  it("단위는 자리다", () => {
    expect(shelterDayOf(grid, "2026-09-30", 1).zones[0].unit).toBe("자리");
  });
});
