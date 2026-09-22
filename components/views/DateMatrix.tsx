"use client";

import { Fragment, useEffect, useRef } from "react";

import { cx } from "@/components/ui";
import { evaluate, type CampData, type Row } from "@/lib/availability";
import { DOW, dowIndex, formatShort, monthKey, todayISO } from "@/lib/date";
import type { ZoneSelection } from "@/store/selection";

type Props = {
  rows: Row[];
  dates: string[];
  data: CampData[];
  selection: Record<string, Record<string, ZoneSelection>>;
  selected: { campId: string | null; date: string } | null;
  /** 처음 열린 날. 표를 그 열까지 밀어 둔다. */
  firstOpenDate: string | null;
  onPick: (campId: string, date: string) => void;
};

/** 좌측 라벨 폭. 구역 이름이 한 줄로 들어갈 만큼. */
const LABEL = "6.5rem";
/** 날짜 열 — 셀에는 채움 아니면 물음표 하나뿐이므로 좁아도 된다. */
const COL = "1.625rem";

function selectedCount(pick: ZoneSelection | undefined) {
  return pick?.mode === "some" ? pick.rooms.length : 0;
}

/**
 * 행=구역/객실, 열=날짜. 간트 차트·숙소 관리 시스템의 객실 달력과 같은 방향이다.
 *
 * 축을 반대로(행=날짜, 열=구역) 두면 "카라반6인특실" 같은 이름을 48px 열에
 * 밀어넣어야 해서 잘리는데, 정작 셀에 들어가는 것은 채움 하나뿐이라 폭이
 * 낭비된다. 이름은 좌측에서 가로로 쓰고 날짜 열은 좁게 두는 편이 맞다.
 *
 * 열이 60개라 가로 스크롤은 불가피하다. 칸은 있음(채움)·없음(비움)·모름(?)
 * 셋뿐이고 숫자를 넣지 않는다 — 자리 수의 많고 적음은 이 화면의 질문이 아니다.
 */
export function DateMatrix({
  rows,
  dates,
  data,
  selection,
  selected,
  firstOpenDate,
  onPick,
}: Props) {
  const today = todayISO();
  const rail = useRef<HTMLDivElement>(null);
  const scrolledTo = useRef<string | null>(null);

  // 조회 기간이 두 달이면 열이 60개가 넘는다. 오늘부터 한참 뒤에야 자리가
  // 열리는 조건에서는 첫 화면이 빈 칸으로만 차 있어 아무것도 없는 것처럼 보인다.
  // 처음 열린 열까지 밀어 둔다. 같은 날짜로는 다시 밀지 않는다 — 3분마다 오는
  // 갱신이 사용자가 잡아 둔 위치를 빼앗으면 안 된다.
  useEffect(() => {
    if (!firstOpenDate || scrolledTo.current === firstOpenDate) return;
    const box = rail.current;
    const cell = box?.querySelector<HTMLElement>("[data-first-open]");
    if (!box || !cell) return;
    scrolledTo.current = firstOpenDate;
    const label = box.querySelector<HTMLElement>("thead th");
    const offset = cell.getBoundingClientRect().left - box.getBoundingClientRect().left;
    box.scrollLeft += offset - (label?.offsetWidth ?? 0);
  }, [firstOpenDate]);

  const groups: { campName: string; rows: Row[] }[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.campName === row.campName) last.rows.push(row);
    else groups.push({ campName: row.campName, rows: [row] });
  }

  const monthSpans: { label: string; span: number }[] = [];
  for (const date of dates) {
    const label = `${Number(monthKey(date).slice(5))}월`;
    const last = monthSpans.at(-1);
    if (last && last.label === label) last.span += 1;
    else monthSpans.push({ label, span: 1 });
  }

  return (
    <div ref={rail} className="rail">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th
              className="sticky top-0 left-0 z-30 border-r border-b border-line bg-surface"
              style={{ width: LABEL, minWidth: LABEL }}
            />
            {monthSpans.map((month) => (
              <th
                key={month.label}
                colSpan={month.span}
                className="sticky top-0 z-20 border-r border-b border-line bg-surface px-1.5 py-1 text-left text-2xs font-semibold whitespace-nowrap text-muted num"
              >
                {month.label}
              </th>
            ))}
          </tr>
          <tr>
            <th
              className="sticky left-0 z-30 border-r border-b border-line bg-surface px-2 py-1 text-left text-2xs font-medium text-subtle"
              style={{ width: LABEL, minWidth: LABEL }}
            >
              구역 / 객실
            </th>
            {dates.map((date) => {
              const dow = dowIndex(date);
              return (
                <th
                  key={date}
                  className={cx(
                    "border-r border-b border-line bg-surface p-0 text-center num",
                    date === today && "font-semibold",
                  )}
                  style={{ width: COL, minWidth: COL }}
                  data-first-open={date === firstOpenDate || undefined}
                >
                  <span className="block text-2xs leading-tight">
                    {Number(date.slice(8, 10))}
                  </span>
                  <span
                    className={cx(
                      "block text-2xs leading-tight",
                      [0, 6].includes(dow) ? "text-weekend" : "text-subtle",
                    )}
                  >
                    {DOW[dow]}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {groups.map((group) => (
            <Fragment key={group.campName}>
              <tr>
                <th
                  colSpan={dates.length + 1}
                  className="border-b border-line bg-surface-2 p-0 text-left"
                >
                  {/* 배경 띠는 전체 폭이지만 텍스트는 따로 붙여야 한다.
                      colSpan th에 sticky를 걸면 박스는 이미 전체 폭이라
                      움직일 여지가 없고 텍스트만 왼쪽으로 사라진다. */}
                  <span className="sticky left-0 inline-block px-2 py-1 text-2xs font-semibold whitespace-nowrap">
                    {group.campName}
                  </span>
                </th>
              </tr>

              {group.rows.map((row) => (
                <tr key={row.key}>
                  <th
                    title={`${row.campName} · ${row.label}`}
                    className={cx(
                      "sticky left-0 z-20 border-r border-b border-line bg-surface px-2 py-0 text-left font-normal",
                      row.kind === "room" && "pl-4 text-subtle",
                    )}
                    style={{ width: LABEL, minWidth: LABEL }}
                  >
                    <span className="block truncate">{row.label}</span>
                    {row.kind === "zone" && row.partial && (
                      <span className="block truncate text-2xs text-subtle num">
                        {selectedCount(selection[row.campId]?.[row.zoneNo])}개 선택
                      </span>
                    )}
                  </th>

                  {dates.map((date) => {
                    const state = evaluate(row, date, data, selection).state;
                    const isSelected =
                      selected?.date === date && selected?.campId === row.campId;

                    return (
                      <td
                        key={date}
                        title={`${row.campName} · ${row.label} · ${formatShort(date)}`}
                        onClick={() => state !== "unknown" && onPick(row.campId, date)}
                        style={{ width: COL, minWidth: COL }}
                        className={cx(
                          "h-8 border-r border-b border-line text-center text-subtle num",
                          state !== "unknown" && "cursor-pointer",
                          state === "open" && "bg-fill",
                          isSelected && "ring-2 ring-accent ring-inset",
                        )}
                      >
                        {state === "unknown" ? "?" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
