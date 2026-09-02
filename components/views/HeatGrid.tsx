"use client";

import { Fragment } from "react";

import { FILL, Empty, cx } from "@/components/ui";
import type { DaySummary } from "@/lib/availability";
import { DOW, dowIndex, todayISO } from "@/lib/date";
import { fillLevel } from "@/lib/policy";

type Props = {
  /** 요일 필터를 적용하지 않은 전 기간. 격자를 끊김 없이 채우려면 전부 필요하다. */
  summaries: DaySummary[];
  activeDows: number[];
  selectedDate: string | null;
  onPick: (date: string) => void;
};

/**
 * 행=요일, 열=주. 축을 이렇게 두면 조회 기간 60일이 7행에 다 들어가고
 * "어느 요일에 자리가 나오는가"라는 패턴이 세로로 읽힌다.
 * 달력의 역할(날짜 감각)과 개관의 역할(전 기간 한눈에)을 함께 한다.
 *
 * 요일 라벨과 셀이 같은 grid에 있어야 행 높이가 어긋나지 않는다.
 */
export function HeatGrid({ summaries, activeDows, selectedDate, onPick }: Props) {
  if (!summaries.length) {
    return (
      <Empty
        title="조회할 대상이 없습니다"
        hint="위의 대상 버튼을 눌러 캠핑장·구역·객실을 선택하세요."
      />
    );
  }

  const today = todayISO();

  const weeks: (DaySummary | null)[][] = [];
  for (const summary of summaries) {
    const dow = dowIndex(summary.date);
    if (!weeks.length || dow === 0) weeks.push(Array<DaySummary | null>(7).fill(null));
    weeks.at(-1)![dow] = summary;
  }

  const monthOf = (week: (DaySummary | null)[]) => {
    const first = week.find(Boolean);
    return first ? Number(first.date.slice(5, 7)) : null;
  };

  return (
    <div className="px-3 py-3">
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `1.25rem repeat(${weeks.length}, minmax(0, 1fr))`,
        }}
      >
        <div />
        {weeks.map((week, index) => {
          const month = monthOf(week);
          const previous = index > 0 ? monthOf(weeks[index - 1]) : null;
          return (
            <div key={`month-${index}`} className="truncate text-2xs text-subtle num">
              {month !== null && month !== previous ? `${month}월` : ""}
            </div>
          );
        })}

        {DOW.map((label, dow) => (
          <Fragment key={label}>
            <div
              className={cx(
                "flex items-center justify-center text-2xs",
                dow === 0 || dow === 6 ? "text-warn" : "text-subtle",
                activeDows.length > 0 && !activeDows.includes(dow) && "opacity-35",
              )}
            >
              {label}
            </div>

            {weeks.map((week, index) => {
              const summary = week[dow];
              if (!summary) return <div key={index} className="aspect-square" />;

              const muted = activeDows.length > 0 && !activeDows.includes(dow);
              const inactive = summary.activeRows === 0;
              const open = summary.openRows > 0;
              const level = open ? fillLevel(summary.openRows, summary.activeRows) : 0;

              return (
                <button
                  key={index}
                  type="button"
                  disabled={inactive}
                  onClick={() => onPick(summary.date)}
                  title={`${summary.date} · ${
                    inactive
                      ? "예약 기간 아님"
                      : open
                        ? `${summary.openRows}곳 ${summary.openUnits}면`
                        : "마감"
                  }`}
                  className={cx(
                    "flex aspect-square items-center justify-center rounded-sm border",
                    inactive
                      ? "hatch cursor-default border-line opacity-40"
                      : open
                        ? cx("border-transparent", FILL[level])
                        : "border-line",
                    muted && "opacity-30",
                    selectedDate === summary.date &&
                      "ring-[1.5px] ring-fg ring-offset-1 ring-offset-bg",
                  )}
                >
                  <span
                    className={cx(
                      "text-2xs leading-none num",
                      summary.date === today &&
                        "underline decoration-2 underline-offset-2",
                      open ? "font-semibold" : "text-subtle",
                    )}
                  >
                    {Number(summary.date.slice(8, 10))}
                  </span>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <p className="mt-3 text-2xs leading-relaxed text-subtle">
        칸의 농도는 선택한 대상 중 몇 곳이 열려 있는지입니다. 칸을 누르면 그날 남은
        자리를 봅니다.
      </p>
    </div>
  );
}
