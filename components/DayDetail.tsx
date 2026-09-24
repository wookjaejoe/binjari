"use client";

import { Sheet } from "@/components/Sheet";
import { Spinner, cx, won } from "@/components/ui";
import { evaluate, selectedRooms, type CampData, type Row } from "@/lib/availability";
import { formatLong, formatShort, shiftISO } from "@/lib/date";
import { useBookingTarget } from "@/lib/hooks";
import type { ZoneSelection } from "@/store/selection";

function BookingButton({
  campId,
  campName,
  date,
  nights,
}: {
  campId: string;
  campName: string;
  date: string;
  nights: number;
}) {
  const { data: target, isPending, error } = useBookingTarget(campId, date, nights);

  if (error) {
    return <p className="text-xs text-error">예약 링크를 만들지 못했어요. 원 사이트에서 찾아볼 수 있어요.</p>;
  }

  return (
    <form method="post" action={target?.url ?? ""} target="_blank">
      {Object.entries(target?.fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        disabled={isPending || !target}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
      >
        {isPending && <Spinner className="border-t-accent-fg" />}
        {campName} 예약 페이지 열기
        <svg viewBox="0 0 12 12" className="size-3 opacity-70" aria-hidden>
          <path
            d="M4 2h6v6M10 2L2.5 9.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </form>
  );
}

export function DayDetail({
  selected,
  rows,
  data,
  selection,
  nights,
  onClose,
}: {
  selected: { campId: string | null; date: string } | null;
  rows: Row[];
  data: CampData[];
  selection: Record<string, Record<string, ZoneSelection>>;
  nights: number;
  onClose: () => void;
}) {
  const date = selected?.date ?? "";
  const campId = selected?.campId ?? null;

  const zoneRows = rows.filter(
    (row) => row.kind === "zone" && (!campId || row.campId === campId),
  );
  // 그 날을 묻지 않은 캠핑장(예약 기간 밖)은 뺀다. 넣으면 행마다 "모름"으로 읽힌다.
  const camps = data.filter((entry) =>
    zoneRows.some(
      (row) =>
        row.campId === entry.camp.id &&
        evaluate(row, date, data, selection).state !== "unasked",
    ),
  );

  const openCamps = camps.filter((entry) =>
    zoneRows.some(
      (row) =>
        row.campId === entry.camp.id &&
        evaluate(row, date, data, selection).state === "open",
    ),
  );

  return (
    <Sheet
      open={Boolean(selected)}
      onClose={onClose}
      title={date ? formatLong(date) : ""}
      subtitle={
        date
          ? `${nights}박 · ${formatShort(date)} → ${formatShort(shiftISO(date, nights))} 체크아웃`
          : undefined
      }
      footer={
        openCamps.length > 0 ? (
          <div className="space-y-2">
            {openCamps.map(({ camp }) => (
              <BookingButton
                key={camp.id}
                campId={camp.id}
                campName={camp.name}
                date={date}
                nights={nights}
              />
            ))}
          </div>
        ) : undefined
      }
    >
      <div className="divide-y divide-line">
        {camps.map(({ camp, roomScan }) => {
          const campRows = zoneRows.filter((row) => row.campId === camp.id);
          return (
            <section key={camp.id} className="px-4 py-3">
              <h3 className="mb-2 text-xs tracking-wide text-subtle">
                {camp.name}
              </h3>

              <ul className="space-y-2.5">
                {campRows.map((row) => {
                  const cell = evaluate(row, date, data, selection);
                  const pick = selection[camp.id]?.[row.zoneNo];
                  const catalog = (roomScan?.rooms ?? []).filter(
                    (room) => room.zoneNo === row.zoneNo,
                  );
                  const chosen = new Set(
                    selectedRooms(pick, catalog.map((room) => room.no)),
                  );
                  const openNow = new Set(roomScan?.available[date] ?? []);
                  const openRooms = catalog.filter(
                    (room) => chosen.has(room.no) && openNow.has(room.no),
                  );

                  return (
                    <li key={row.key}>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cx(
                            "text-sm",
                            cell.state === "open" ? "font-medium" : "text-muted",
                          )}
                        >
                          {row.label}
                        </span>
                        <span
                          className={cx(
                            "text-xs num",
                            cell.state === "open"
                              ? "font-semibold"
                              : "text-subtle",
                          )}
                        >
                          {cell.state === "open"
                            ? `${cell.count}면`
                            : cell.state === "none"
                              ? "없음"
                              : cell.state === "loading"
                                ? "조회 중"
                                : "모름"}
                        </span>
                        {cell.state === "open" && cell.amount != null && (
                          <span className="ml-auto text-xs text-muted num">
                            {won(cell.amount)}
                          </span>
                        )}
                      </div>

                      {openRooms.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {openRooms.map((room) => (
                            <span
                              key={room.no}
                              className="rounded-sm border border-line px-1.5 py-1 text-xs"
                            >
                              {room.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}
