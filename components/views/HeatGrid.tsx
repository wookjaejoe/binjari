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

/** 칸 높이만 고정하고 폭은 열에 맡긴다. 열이 7개로 고정이라 폭은 흔들리지 않는다. */
const ROW = "2.75rem";
/** 주 라벨 열 — 그 주에 새 달이 시작하면 달을 적는다. */
const GUTTER = "1.75rem";

/**
 * 행=주, 열=요일. 열이 7개로 고정이므로 조회 기간이 얼마가 되든 칸 크기가 변하지
 * 않고, 늘어나는 것은 세로뿐이다. 세로 스크롤은 페이지 스크롤과 이어져 자연스럽다.
 *
 * 축을 반대로(행=요일, 열=주) 두면 GitHub 잔디처럼 압축되지만 열 개수가 기간에
 * 딸려 변한다. 실측으로 9주 30px ↔ 5주 57px까지 벌어졌고, 예약 기간은 사이트가
 * 정하므로 더 길어지면 칸이 20px 아래로 내려간다. 그 크기엔 날짜도 터치도 없다.
 *
 * 달과 달 사이를 끊지 않는다 — 9월 30일 다음이 10월 1일이라는 연속성이
 * 이 화면의 핵심이고, 월별로 잘라 빈칸을 넣으면 그게 깨진다.
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
    if (!weeks.length || dow === 0)
      weeks.push(Array<DaySummary | null>(7).fill(null));
    weeks.at(-1)![dow] = summary;
  }

  /** 그 주에 처음 등장하는 달. 이전 주와 다를 때만 라벨을 남긴다. */
  const monthLabels = weeks.map((week, index) => {
    const months = week.filter(Boolean).map((day) => Number(day!.date.slice(5, 7)));
    if (!months.length) return null;
    const previous = weeks
      .slice(0, index)
      .flatMap((prior) => prior.filter(Boolean))
      .map((day) => Number(day!.date.slice(5, 7)));
    const fresh = months.find((month) => !previous.includes(month));
    return fresh ?? null;
  });

  return (
    <div className="px-3 py-3">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `${GUTTER} repeat(7, minmax(0, 1fr))` }}
      >
        <div />
        {DOW.map((label, dow) => (
          <div
            key={label}
            className={cx(
              "pb-0.5 text-center text-2xs",
              dow === 0 || dow === 6 ? "text-warn" : "text-subtle",
              activeDows.length > 0 && !activeDows.includes(dow) && "opacity-35",
            )}
          >
            {label}
          </div>
        ))}

        {weeks.map((week, weekIndex) => (
          <Fragment key={weekIndex}>
            <div className="flex items-center justify-end pr-0.5 text-2xs text-subtle num">
              {monthLabels[weekIndex] !== null ? `${monthLabels[weekIndex]}월` : ""}
            </div>

            {week.map((summary, dow) => {
              if (!summary) {
                return <div key={dow} style={{ height: ROW }} />;
              }

              const muted = activeDows.length > 0 && !activeDows.includes(dow);
              const inactive = summary.activeRows === 0;
              const open = summary.openRows > 0;
              const level = open
                ? fillLevel(summary.openRows, summary.activeRows)
                : 0;

              return (
                <button
                  key={dow}
                  type="button"
                  disabled={inactive}
                  onClick={() => onPick(summary.date)}
                  style={{ height: ROW }}
                  title={`${summary.date} · ${
                    inactive
                      ? "예약 기간 아님"
                      : open
                        ? `${summary.openRows}곳 ${summary.openUnits}면`
                        : "마감"
                  }`}
                  className={cx(
                    "flex flex-col items-center justify-center gap-px rounded-md border",
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
                      "text-xs leading-none num",
                      summary.date === today &&
                        "underline decoration-2 underline-offset-2",
                      open ? "font-semibold" : "text-subtle",
                    )}
                  >
                    {Number(summary.date.slice(8, 10))}
                  </span>
                  {open && (
                    <span className="text-2xs leading-none text-muted num">
                      {summary.openUnits}
                    </span>
                  )}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <p className="mt-3 text-2xs leading-relaxed text-subtle">
        칸의 위 숫자는 날짜, 아래는 열려 있는 자리 수입니다. 농도는 선택한 대상 중
        몇 곳이 열려 있는지를 나타냅니다.
      </p>
    </div>
  );
}
