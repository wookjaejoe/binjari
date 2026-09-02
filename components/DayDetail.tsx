"use client";

import { Sheet } from "@/components/Sheet";
import { Spinner, cx, won } from "@/components/ui";
import { evaluate, selectedRooms, type CampData, type Row } from "@/lib/availability";
import { formatLong, shiftISO } from "@/lib/date";
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
    return <p className="text-[11.5px] text-warn">예약 링크를 만들지 못했습니다.</p>;
  }

  return (
    <form method="post" action={target?.url ?? ""} target="_blank">
      {Object.entries(target?.fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        disabled={isPending || !target}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-inverse py-2.5 text-[13px] font-semibold text-inverse-fg disabled:opacity-50"
      >
        {isPending && <Spinner className="border-t-inverse-fg" />}
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
  const camps = data.filter((entry) =>
    zoneRows.some((row) => row.campId === entry.camp.id),
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
          ? `${nights}박 · ${date} → ${shiftISO(date, nights)} 체크아웃`
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
            <p className="text-center text-[10.5px] text-subtle">
              새 탭에서 이 일정이 선택된 상태로 열립니다
            </p>
          </div>
        ) : undefined
      }
    >
      <div className="divide-y divide-line">
        {camps.map(({ camp, roomScan }) => {
          const campRows = zoneRows.filter((row) => row.campId === camp.id);
          return (
            <section key={camp.id} className="px-4 py-3">
              <h3 className="mb-2 text-[11px] tracking-wide text-subtle">
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
                            "text-[13px]",
                            cell.state === "open" ? "font-medium" : "text-muted",
                          )}
                        >
                          {row.label}
                        </span>
                        <span
                          className={cx(
                            "text-[12px] num",
                            cell.state === "open"
                              ? "font-semibold"
                              : "text-subtle",
                          )}
                        >
                          {cell.state === "open"
                            ? `${cell.count}면`
                            : cell.state === "full"
                              ? "마감"
                              : cell.state === "outside"
                                ? "예약 기간 아님"
                                : "조회 불가"}
                        </span>
                        {cell.state === "open" && cell.amount != null && (
                          <span className="ml-auto text-[12px] text-muted num">
                            {won(cell.amount)}
                          </span>
                        )}
                      </div>

                      {openRooms.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {openRooms.map((room) => (
                            <span
                              key={room.no}
                              className="rounded-md border border-line-strong px-1.5 py-0.5 text-[11.5px]"
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
