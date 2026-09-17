"use client";

import Image from "next/image";

import { evaluate, type CampData, type Row } from "@/lib/availability";
import { DOW, dowIndex, formatShort } from "@/lib/date";
import type { ZoneSelection } from "@/store/selection";

type ZoneRow = Extract<Row, { kind: "zone" }>;

type Props = {
  rows: Row[];
  dates: string[];
  data: CampData[];
  selection: Record<string, Record<string, ZoneSelection>>;
  onPick: (campId: string, date: string) => void;
};

/**
 * 칩으로 보여줄 열린 날짜는 앞에서 6개까지만이다. 한 줄이 넘치면 표가 이미
 * 하는 일(전체 날짜를 훑는 것)을 여기서 반복하는 셈이다.
 */
const MAX_CHIPS = 6;

/**
 * 표 위에서 같은 데이터를 행(자리) 관점으로 먼저 보여준다. 순위·"가장 많은" 같은
 * 판단은 하지 않는다 — 구역마다 열린 날짜를 나열할 뿐이다. 근거는 DESIGN.md 1.7·1.8.
 */
export function ZoneCards({ rows, dates, data, selection, onPick }: Props) {
  const zoneRows = rows.filter((row): row is ZoneRow => row.kind === "zone");
  if (!zoneRows.length) return null;

  const groups: { campId: string; campName: string; rows: ZoneRow[] }[] = [];
  for (const row of zoneRows) {
    const last = groups.at(-1);
    if (last && last.campId === row.campId) last.rows.push(row);
    else groups.push({ campId: row.campId, campName: row.campName, rows: [row] });
  }

  return (
    <div className="divide-y divide-line">
      {groups.map((group) => (
        <section key={group.campId} className="py-3 first:pt-0 last:pb-0">
          <p className="pb-2 text-sm font-semibold">{group.campName}</p>
          <ul className="space-y-3">
            {group.rows.map((row) => (
              <ZoneCard
                key={row.key}
                row={row}
                dates={dates}
                data={data}
                selection={selection}
                onPick={onPick}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ZoneCard({
  row,
  dates,
  data,
  selection,
  onPick,
}: {
  row: ZoneRow;
  dates: string[];
  data: CampData[];
  selection: Record<string, Record<string, ZoneSelection>>;
  onPick: (campId: string, date: string) => void;
}) {
  const openDates: string[] = [];
  let unknownCount = 0;
  for (const date of dates) {
    const state = evaluate(row, date, data, selection).state;
    if (state === "open") openDates.push(date);
    else if (state === "unknown") unknownCount += 1;
  }
  const allUnknown = dates.length > 0 && unknownCount === dates.length;

  const shown = openDates.slice(0, MAX_CHIPS);
  const rest = openDates.length - shown.length;

  return (
    <li className="flex items-start gap-3">
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
        {row.ground && <p className="truncate text-xs text-subtle">{row.ground}</p>}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {openDates.length === 0 ? (
            <span className="text-xs text-subtle">{allUnknown ? "모름" : "없음"}</span>
          ) : (
            <>
              {shown.map((date) => {
                const dow = dowIndex(date);
                const weekend = dow === 0 || dow === 6;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onPick(row.campId, date)}
                    className="rounded-full border border-line px-2.5 py-1 text-xs num"
                  >
                    {formatShort(date)}{" "}
                    <span className={weekend ? "text-weekend" : "text-subtle"}>
                      {DOW[dow]}
                    </span>
                  </button>
                );
              })}
              {rest > 0 && <span className="text-xs text-muted">+{rest}일</span>}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
