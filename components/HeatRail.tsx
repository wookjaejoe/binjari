"use client";

import { FILL, cx } from "@/components/ui";
import type { DaySummary } from "@/lib/availability";
import { DOW, dayOfMonth, dowIndex, todayISO } from "@/lib/date";
import { fillLevel } from "@/lib/policy";

/**
 * 조회 기간 전체를 한 줄로 압축한 개관. 주 단위로 묶어 날짜를 눈으로 세기 쉽게 하고,
 * 막대 농도로 그날 열려 있는 자리의 양을 보여준다.
 */
export function HeatRail({
  summaries,
  selectedDate,
  onPick,
}: {
  summaries: DaySummary[];
  selectedDate: string | null;
  onPick: (date: string) => void;
}) {
  if (!summaries.length) return null;

  const today = todayISO();

  const weeks: DaySummary[][] = [];
  for (const summary of summaries) {
    if (!weeks.length || dowIndex(summary.date) === 0) weeks.push([summary]);
    else weeks.at(-1)!.push(summary);
  }

  return (
    <div>
      <div className="flex items-end gap-[5px] pt-3.5">
        {weeks.map((week) => (
          <div key={week[0].date} className="flex min-w-0 flex-1 gap-px">
            {week.map((summary) => {
              const level =
                summary.activeRows === 0
                  ? -1
                  : fillLevel(summary.openRows, summary.activeRows);
              const isToday = summary.date === today;
              const isSelected = summary.date === selectedDate;
              const weekend = [0, 6].includes(dowIndex(summary.date));

              return (
                <button
                  key={summary.date}
                  type="button"
                  onClick={() => onPick(summary.date)}
                  title={`${summary.date} · ${
                    summary.activeRows === 0
                      ? "예약 기간 아님"
                      : summary.openRows === 0
                        ? "마감"
                        : `${summary.openRows}곳 ${summary.openUnits}면`
                  }`}
                  className="group relative min-w-[4px] flex-1"
                >
                  <span
                    className={cx(
                      "block h-7 rounded-[2px] transition-[background-color]",
                      level === -1 ? "hatch opacity-50" : FILL[level],
                      isSelected && "ring-[1.5px] ring-fg ring-offset-1 ring-offset-bg",
                    )}
                  />
                  <span
                    className={cx(
                      "mt-1 block h-[3px] rounded-full",
                      isToday ? "bg-fg" : weekend ? "bg-line-strong" : "bg-transparent",
                    )}
                  />
                  {dayOfMonth(summary.date) === 1 && (
                    <span className="absolute -top-3.5 left-0 text-[9px] leading-none text-subtle num">
                      {Number(summary.date.slice(5, 7))}월
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-subtle num">
        <span>
          {summaries[0].date.slice(5).replace("-", "/")} ({DOW[dowIndex(summaries[0].date)]})
        </span>
        <span className="text-muted">
          {summaries.filter((s) => s.openRows > 0).length}일 가능 / {summaries.length}일
        </span>
        <span>
          {summaries.at(-1)!.date.slice(5).replace("-", "/")} (
          {DOW[dowIndex(summaries.at(-1)!.date)]})
        </span>
      </div>
    </div>
  );
}

export function MiniLegend() {
  return (
    <div className="flex items-center gap-3 text-[10.5px] text-subtle">
      <span className="flex items-center gap-1">
        많음
        <span className="flex gap-px">
          {[4, 3, 2, 1].map((level) => (
            <span key={level} className={cx("size-2 rounded-[1px]", FILL[level])} />
          ))}
        </span>
        적음
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-[1px] bg-surface-2" />
        마감
      </span>
      <span className="flex items-center gap-1">
        <span className="hatch size-2 rounded-[1px] opacity-60" />
        기간 아님
      </span>
    </div>
  );
}
