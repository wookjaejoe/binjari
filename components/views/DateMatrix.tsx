"use client";

import { Fragment } from "react";

import { FILL, Empty, cx } from "@/components/ui";
import { evaluate, type Cell, type CampData, type Row } from "@/lib/availability";
import { DOW, dowIndex, monthKey, todayISO } from "@/lib/date";
import { fillScale } from "@/lib/policy";
import type { ZoneSelection } from "@/store/selection";

type Props = {
  rows: Row[];
  dates: string[];
  data: CampData[];
  selection: Record<string, Record<string, ZoneSelection>>;
  selected: { campId: string | null; date: string } | null;
  onPick: (campId: string, date: string) => void;
};

/** 좌측 라벨 폭. 구역 이름이 한 줄로 들어갈 만큼. */
const LABEL = "6.5rem";
/** 날짜 열 — 셀에는 잔여 수 한두 자리만 들어가므로 좁아도 된다. */
const COL = "1.625rem";

/**
 * 행=구역/객실, 열=날짜. 간트 차트·숙소 관리 시스템의 객실 달력과 같은 방향이다.
 *
 * 축을 반대로(행=날짜, 열=구역) 두면 "카라반6인특실" 같은 이름을 48px 열에
 * 밀어넣어야 해서 잘리는데, 정작 셀에 들어가는 것은 숫자 한두 자뿐이라 폭이
 * 낭비된다. 이름은 좌측에서 가로로 쓰고 날짜 열은 좁게 두는 편이 맞다.
 *
 * 열이 60개라 가로 스크롤은 불가피하다 — 이 화면의 몫은 전체 개관이 아니라
 * 대상 간 정밀 비교이고, 개관은 히트맵이 맡는다.
 */
export function DateMatrix({
  rows,
  dates,
  data,
  selection,
  selected,
  onPick,
}: Props) {
  if (!rows.length) {
    return (
      <Empty
        title="조회할 대상이 없어요"
        hint="위 대상 버튼에서 캠핑장과 구역을 골라 주세요."
      />
    );
  }
  if (!dates.length) {
    return <Empty title="조회할 날짜가 없어요" />;
  }

  const today = todayISO();

  // 셀을 먼저 전부 구한다. 농도 스케일이 화면 전체의 분포를 알아야 하고,
  // 두 번 평가하지 않기 위해서다.
  const cells = new Map<string, Cell>();
  for (const row of rows) {
    for (const date of dates) {
      cells.set(`${row.key}|${date}`, evaluate(row, date, data, selection));
    }
  }

  // 행마다 면 수가 82면부터 1면까지 벌어지므로 잔여 수 자체가 아니라 잔여 비율을
  // 비교한다. 그렇지 않으면 큰 구역이 늘 진하고 단일 객실은 늘 흐리다.
  const ratio = (cell: Cell) => cell.count / Math.max(1, cell.capacity);
  const shade = fillScale(
    [...cells.values()].filter((cell) => cell.state === "open").map(ratio),
  );

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
    <div className="rail">
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
                    {row.kind === "zone" && (
                      <span className="block truncate text-2xs text-subtle num">
                        {row.partial ? `${row.capacity}/${row.total}면 선택` : `${row.total}면`}
                      </span>
                    )}
                  </th>

                  {dates.map((date) => {
                    const cell = cells.get(`${row.key}|${date}`)!;
                    const level = cell.state === "open" ? shade(ratio(cell)) : 0;
                    const isSelected =
                      selected?.date === date && selected?.campId === row.campId;

                    return (
                      <td
                        key={date}
                        title={`${row.campName} · ${row.label} · ${date}`}
                        onClick={() =>
                          (cell.state === "open" || cell.state === "full") &&
                          onPick(row.campId, date)
                        }
                        style={{ width: COL, minWidth: COL }}
                        className={cx(
                          "h-8 border-r border-b border-line text-center num",
                          cell.state === "open" &&
                            cx("cursor-pointer font-semibold", FILL[level]),
                          cell.state === "full" && "cursor-pointer text-subtle",
                          cell.state === "outside" && "hatch opacity-45",
                          isSelected && "ring-2 ring-accent ring-inset",
                        )}
                      >
                        {cell.state === "open"
                          ? cell.capacity === 1
                            ? "●"
                            : cell.count
                          : cell.state === "full"
                            ? "·"
                            : cell.state === "unknown"
                              ? "?"
                              : ""}
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
