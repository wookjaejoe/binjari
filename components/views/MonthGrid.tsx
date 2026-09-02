"use client";

import { FILL, Empty, cx, wonShort } from "@/components/ui";
import type { DaySummary } from "@/lib/availability";
import { DOW, monthKey, todayISO } from "@/lib/date";
import { fillLevel } from "@/lib/policy";

/**
 * B안 — 월 달력. 날짜 감각이 가장 직관적이고, 연휴·주말 패턴이 한눈에 보인다.
 * 셀 농도는 그 달 안에서의 상대량이 아니라 전체 기간 최대치 기준이다.
 */
export function MonthGrid({
  summaries,
  selectedDate,
  onPick,
}: {
  summaries: DaySummary[];
  selectedDate: string | null;
  onPick: (date: string) => void;
}) {
  if (!summaries.length) {
    return (
      <Empty
        title="조회할 대상이 없습니다"
        hint="위의 대상 버튼을 눌러 캠핑장·구역·객실을 선택하세요."
      />
    );
  }

  const today = todayISO();
  const lookup = new Map(summaries.map((s) => [s.date, s]));
  const months = [...new Set(summaries.map((s) => monthKey(s.date)))];

  return (
    <div className="space-y-5 px-3 py-3">
      {months.map((key) => {
        const [year, month] = key.split("-").map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        const leading = new Date(year, month - 1, 1).getDay();

        return (
          <section key={key}>
            <h3 className="mb-2 px-1 text-[12.5px] font-semibold num">
              {year}. {month}
            </h3>
            <div className="grid grid-cols-7 gap-1">
              {DOW.map((label, index) => (
                <div
                  key={label}
                  className={cx(
                    "pb-0.5 text-center text-[10.5px]",
                    index === 0 || index === 6 ? "text-warn" : "text-subtle",
                  )}
                >
                  {label}
                </div>
              ))}
              {Array.from({ length: leading }, (_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const date = `${key}-${String(i + 1).padStart(2, "0")}`;
                const summary = lookup.get(date);
                const inactive = !summary || summary.activeRows === 0;
                const open = (summary?.openRows ?? 0) > 0;
                const level = open
                  ? fillLevel(summary!.openRows, summary!.activeRows)
                  : 0;

                return (
                  <button
                    key={date}
                    type="button"
                    disabled={inactive}
                    onClick={() => onPick(date)}
                    className={cx(
                      "flex aspect-[5/6] flex-col rounded-md border p-1 text-left",
                      inactive
                        ? "hatch cursor-default border-line opacity-45"
                        : open
                          ? cx("border-transparent", FILL[level])
                          : "border-line",
                      selectedDate === date &&
                        "ring-[1.5px] ring-fg ring-offset-1 ring-offset-bg",
                    )}
                  >
                    <span
                      className={cx(
                        "text-[11px] num",
                        open ? "font-semibold text-fg" : "text-subtle",
                      )}
                    >
                      {i + 1}
                      {date === today && (
                        <span className="ml-0.5 inline-block size-1 align-middle rounded-full bg-fg" />
                      )}
                    </span>

                    {open && (
                      <span className="mt-auto">
                        <span className="block text-[12px] leading-none font-semibold num">
                          {summary!.openUnits}
                          <span className="text-[9px] font-normal text-muted">면</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[9.5px] text-muted num">
                          {wonShort(summary!.minAmount)}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
