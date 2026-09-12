"use client";

import { Empty, cx, wonShort } from "@/components/ui";
import { evaluate, type CampData, type Row } from "@/lib/availability";
import { DOW, dowIndex, shiftISO } from "@/lib/date";
import type { ZoneSelection } from "@/store/selection";

type Props = {
  rows: Row[];
  dates: string[];
  data: CampData[];
  selection: Record<string, Record<string, ZoneSelection>>;
  nights: number;
  selectedDate: string | null;
  onPick: (date: string) => void;
};

const SHOWN = 4;

/** "봉수대오토캠핑장" → "봉수대". 칩 안에서 캠핑장을 구별할 만큼만 남긴다. */
function shortCamp(name: string) {
  return name.replace(/\s*(오토)?캠핑장$/, "").trim() || name;
}

/**
 * A안 — 가능한 날만 위에서 아래로. 모바일에서 가장 자연스럽고
 * "언제 갈 수 있나"에 스크롤 한 번으로 답한다.
 * 칩은 잔여율이 낮은 순 — 거의 찬 자리가 먼저 눈에 들어와야 한다.
 */
export function DayStream({
  rows,
  dates,
  data,
  selection,
  nights,
  selectedDate,
  onPick,
}: Props) {
  const zoneRows = rows.filter((row) => row.kind === "zone");

  if (!zoneRows.length) {
    return (
      <Empty
        title="고른 대상이 없어요"
      />
    );
  }

  const days = dates
    .map((date) => ({
      date,
      hits: zoneRows
        .map((row) => ({ row, cell: evaluate(row, date, data, selection) }))
        .filter((hit) => hit.cell.state === "open")
        .sort(
          (a, b) =>
            a.cell.count / Math.max(1, a.cell.capacity) -
            b.cell.count / Math.max(1, b.cell.capacity),
        ),
    }))
    .filter((day) => day.hits.length > 0);

  if (!days.length) {
    return (
      <Empty
        title={`${nights}박으로는 빈자리가 없어요`}
        hint="숙박일수를 줄이거나 대상을 늘려 봐요."
      />
    );
  }

  return (
    <ol className="divide-y divide-line">
      {days.map(({ date, hits }) => {
        const dow = dowIndex(date);
        const shown = hits.slice(0, SHOWN);
        const rest = hits.length - shown.length;
        const cheapest = hits.reduce<number | null>(
          (min, hit) =>
            hit.cell.amount != null && (min == null || hit.cell.amount < min)
              ? hit.cell.amount
              : min,
          null,
        );

        return (
          <li key={date}>
            <button
              type="button"
              onClick={() => onPick(date)}
              className={cx(
                "flex w-full items-start gap-3 px-3.5 py-3 text-left active:bg-surface-2",
                selectedDate === date && "bg-surface-2",
              )}
            >
              <span className="w-12 shrink-0">
                <span className="block text-lg leading-none font-semibold num">
                  {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))}
                </span>
                <span
                  className={cx(
                    "mt-1 block text-xs",
                    [0, 6].includes(dow) ? "text-weekend" : "text-muted",
                  )}
                >
                  {DOW[dow]}
                  {nights > 1 && (
                    <span className="text-subtle">
                      {" →"}
                      {Number(shiftISO(date, nights).slice(8, 10))}
                    </span>
                  )}
                </span>
              </span>

              <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                {shown.map(({ row, cell }) => (
                  <span
                    key={row.key}
                    className="flex max-w-full items-center gap-1 rounded-sm border border-line bg-bg px-1.5 py-1 text-xs"
                  >
                    <span className="shrink-0 text-subtle">
                      {shortCamp(row.campName)}
                    </span>
                    <span className="min-w-0 truncate">{row.label}</span>
                    <span className="shrink-0 font-semibold num">{cell.count}</span>
                  </span>
                ))}
                {rest > 0 && (
                  <span className="flex items-center px-1 text-xs text-subtle num">
                    +{rest}
                  </span>
                )}
              </span>

              <span className="shrink-0 text-right">
                <span className="block text-xs font-medium num">
                  {hits.length}곳
                </span>
                {cheapest != null && (
                  <span className="mt-0.5 block text-xs text-subtle num">
                    {wonShort(cheapest)}~
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
