"use client";

import { Fragment } from "react";

import { FILL, Empty, cx } from "@/components/ui";
import { evaluate, type CampData, type Row } from "@/lib/availability";
import { DOW, dowIndex, monthKey, todayISO } from "@/lib/date";
import { fillLevel } from "@/lib/policy";
import type { ZoneSelection } from "@/store/selection";

type Props = {
  rows: Row[];
  dates: string[];
  data: CampData[];
  selection: Record<string, Record<string, ZoneSelection>>;
  selected: { campId: string | null; date: string } | null;
  onPick: (campId: string, date: string) => void;
};

/**
 * C안 — 축을 전치한 표. 행이 날짜라 세로 스크롤로 읽히고,
 * 열끼리 직접 비교되므로 "이 날은 A는 마감인데 B는 남았다"가 즉시 보인다.
 */
export function DateMatrix({
  rows,
  dates,
  data,
  selection,
  selected,
  onPick,
}: Props) {
  const columns = rows.filter((row) => row.kind === "zone" || row.kind === "room");

  if (!columns.length) {
    return (
      <Empty
        title="조회할 대상이 없습니다"
        hint="위의 대상 버튼을 눌러 캠핑장·구역·객실을 선택하세요."
      />
    );
  }
  if (!dates.length) {
    return <Empty title="조회할 날짜가 없습니다" />;
  }

  const today = todayISO();
  const groups: { campName: string; columns: Row[] }[] = [];
  for (const column of columns) {
    const last = groups.at(-1);
    if (last && last.campName === column.campName) last.columns.push(column);
    else groups.push({ campName: column.campName, columns: [column] });
  }

  return (
    <div className="rail">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th
              rowSpan={2}
              className="sticky left-0 z-30 w-[46px] min-w-[46px] border-r border-b border-line bg-surface"
            />
            {groups.map((group) => (
              <th
                key={group.campName}
                colSpan={group.columns.length}
                className="border-r border-b border-line bg-surface px-2 py-1 text-left text-xs font-semibold whitespace-nowrap text-muted"
              >
                {group.campName}
              </th>
            ))}
          </tr>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                title={`${column.campName} · ${column.label}`}
                className={cx(
                  "sticky top-0 z-20 w-12 min-w-12 border-r border-b border-line bg-surface px-1 py-1.5 align-bottom",
                  column.kind === "room" && "text-subtle",
                )}
              >
                <span className="line-clamp-2 text-center text-2xs leading-[1.25] font-medium break-all">
                  {column.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date, index) => {
            const dow = dowIndex(date);
            const newMonth = index === 0 || monthKey(date) !== monthKey(dates[index - 1]);

            return (
              <Fragment key={date}>
                {newMonth && (
                  <tr>
                    <th
                      colSpan={columns.length + 1}
                      className="sticky left-0 z-20 border-b border-line bg-surface-2 px-2 py-0.5 text-left text-xs font-semibold num"
                    >
                      {Number(date.slice(5, 7))}월
                    </th>
                  </tr>
                )}
                <tr>
                  <th
                    className={cx(
                      "sticky left-0 z-20 w-[46px] min-w-[46px] border-r border-b border-line bg-surface px-1 py-0 text-right font-normal num",
                      date === today && "font-semibold",
                    )}
                  >
                    <span className="block text-xs">
                      {Number(date.slice(8, 10))}
                    </span>
                    <span
                      className={cx(
                        "block text-2xs",
                        [0, 6].includes(dow) ? "text-warn" : "text-subtle",
                      )}
                    >
                      {DOW[dow]}
                    </span>
                  </th>

                  {columns.map((column) => {
                    const cell = evaluate(column, date, data, selection);
                    const level =
                      cell.state === "open"
                        ? fillLevel(cell.count, Math.max(1, cell.capacity))
                        : 0;
                    const isSelected =
                      selected?.date === date && selected?.campId === column.campId;

                    return (
                      <td
                        key={column.key}
                        title={`${column.campName} · ${column.label} · ${date}`}
                        onClick={() =>
                          (cell.state === "open" || cell.state === "full") &&
                          onPick(column.campId, date)
                        }
                        className={cx(
                          "h-8 w-12 min-w-12 border-r border-b border-line text-center num",
                          cell.state === "open" &&
                            cx("cursor-pointer font-semibold", FILL[level]),
                          cell.state === "full" && "cursor-pointer text-subtle",
                          cell.state === "outside" && "hatch opacity-45",
                          isSelected && "ring-[1.5px] ring-fg ring-inset",
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
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
