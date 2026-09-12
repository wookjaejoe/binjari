"use client";

import Image from "next/image";

import { evaluate, type CampData, type DaySummary, type Row } from "@/lib/availability";
import { dowIndex, formatLong } from "@/lib/date";
import type { ZoneSelection } from "@/store/selection";

import { cx } from "@/components/ui";

/**
 * 화면 맨 위의 답. "언제 가면 되는지"를 먼저 말하고, 그 날의 구역 내역을 근거로 붙인다.
 *
 * 사진이 여기 있는 이유는 장식이 아니다. 이 앱은 남의 사이트에서 읽은 숫자만 보여주기
 * 때문에, 사진이 없으면 화면에 장소가 등장하지 않는다. 근거는 DESIGN.md 1.1.
 */
export function Highlight({
  summaries,
  rows,
  data,
  selection,
  activeDows,
  nights,
  onPick,
}: {
  summaries: DaySummary[];
  rows: Row[];
  data: CampData[];
  selection: Record<string, Record<string, ZoneSelection>>;
  activeDows: number[];
  nights: number;
  onPick: (date: string) => void;
}) {
  // 빈 배열은 "요일 전체"다 — 아무것도 안 고른 것이 아니다(FilterSheets 의 dowLabel 과 같은 규칙).
  const open = summaries.filter(
    (s) =>
      s.openUnits > 0 &&
      (activeDows.length === 0 || activeDows.includes(dowIndex(s.date))),
  );
  if (!open.length) return null;

  // 주말을 먼저 본다. 주말에 아무 자리도 없으면 기간 전체에서 고르고 라벨을 바꾼다.
  const weekend = open.filter((s) => [0, 6].includes(dowIndex(s.date)));
  const pool = weekend.length ? weekend : open;
  const pick = pool.reduce((best, s) =>
    s.openUnits > best.openUnits ? s : best,
  );

  const zoneRows = rows.filter((r) => r.kind === "zone");
  const cells = zoneRows
    .map((row) => ({ row, cell: evaluate(row, pick.date, data, selection) }))
    .filter(({ cell }) => cell.state !== "outside");

  const hero = cells
    .filter(({ row, cell }) => row.photo && cell.state === "open")
    .sort((a, b) => b.cell.count - a.cell.count)[0];

  const camps = data
    .map(({ camp }) => ({
      camp,
      items: cells.filter(({ row }) => row.campId === camp.id),
    }))
    .filter((g) => g.items.length);

  return (
    <section className="px-4">
      {hero?.row.photo && (
        <Image
          src={hero.row.photo}
          alt=""
          width={780}
          height={520}
          sizes="(min-width: 768px) 720px, 100vw"
          className="aspect-[3/2] w-full rounded-md object-cover"
        />
      )}

      <p className="mt-3 text-xs text-subtle">
        자리가 가장 많은 {weekend.length ? "주말" : "날"}
      </p>
      <button
        type="button"
        onClick={() => onPick(pick.date)}
        className="mt-1 block text-left text-xl font-semibold"
      >
        {formatLong(pick.date)}
      </button>
      <p className="mt-1 text-sm text-muted">
        <strong className="num font-semibold text-accent">{pick.openUnits}</strong>자리 ·{" "}
        {nights}박
      </p>

      <div className="mt-5 -mx-4 border-t border-line">
        {camps.map(({ camp, items }) => {
          const sum = items.reduce(
            (t, { cell }) => t + (cell.state === "open" ? cell.count : 0),
            0,
          );
          return (
            <section key={camp.id}>
              <div className="flex items-baseline justify-between px-4 pt-3.5 pb-1">
                <p className="text-sm font-semibold">{camp.name}</p>
                <p className="num text-xs text-muted">{sum}자리</p>
              </div>
              <ul className="divide-y divide-line">
                {items.map(({ row, cell }) => (
                  <li key={row.key} className="flex items-center gap-3 px-4 py-2.5">
                    {row.photo ? (
                      <Image
                        src={row.photo}
                        alt=""
                        width={104}
                        height={104}
                        sizes="52px"
                        className="size-13 shrink-0 rounded-sm object-cover"
                      />
                    ) : (
                      <span className="size-13 shrink-0 rounded-sm border border-line" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.label}</p>
                      <p className="num mt-0.5 text-xs text-subtle">
                        {[row.ground, cell.amount != null && `${Math.round(cell.amount / 10000)}만원`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {cell.state === "open" ? (
                      <p className="num text-lg font-semibold text-accent">
                        {cell.count}
                        <span className="ml-0.5 text-2xs font-normal text-subtle">
                          /{row.total}
                        </span>
                      </p>
                    ) : (
                      <p className={cx("text-xs text-subtle")}>
                        {cell.state === "unknown" ? "조회 실패" : "마감"}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}
