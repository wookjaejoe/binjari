"use client";

import { useMemo, useState } from "react";

import { Check, Spinner, cx, wonShort } from "@/components/ui";
import { selectedRooms, type CampData } from "@/lib/availability";
import { formatMonthDay } from "@/lib/date";
import type { BookingWindow } from "@/lib/types";
import { useSelection } from "@/store/selection";

/** 포털이 알려준 기간과 한도를 그대로 적는다. 없는 값은 조각째 뺀다. */
function windowLabel(window: BookingWindow | null, error?: string) {
  if (!window) return error ? "조회 실패" : "예약 기간 없음";
  return [
    `${formatMonthDay(window.start)}–${formatMonthDay(window.end)}`,
    window.maxStay != null && `최대 ${window.maxStay}박`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 10 10"
      aria-hidden
      className={cx(
        "size-2.5 shrink-0 text-subtle transition-transform",
        open && "rotate-90",
      )}
    >
      <path
        d="M3.5 1.5L7 5l-3.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TargetPicker({ data }: { data: CampData[] }) {
  const {
    selection,
    expanded,
    toggleExpanded,
    setCamp,
    requestCampAll,
    setZone,
    setRoom,
    clearAll,
  } = useSelection();
  const [query, setQuery] = useState("");

  const pickedCamps = Object.values(selection).filter(
    (zones) => Object.keys(zones).length > 0,
  ).length;

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      !needle
        ? data
        : data.filter(({ camp, zoneScan, roomScan }) =>
            [
              camp.name,
              ...(zoneScan?.zones ?? []).map((zone) => zone.name),
              ...(roomScan?.rooms ?? []).map((room) => room.name),
            ]
              .join(" ")
              .toLowerCase()
              .includes(needle),
          ),
    [data, needle],
  );

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="캠핑장 · 구역 · 객실"
          className="min-w-0 flex-1 rounded-md bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-subtle"
        />
        {pickedCamps > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 text-xs whitespace-nowrap text-muted active:text-fg"
          >
            전체 해제
          </button>
        )}
      </div>

      <ul className="pb-2">
        {visible.map(({ camp, zoneScan, roomScan }) => {
          const picks = selection[camp.id];
          const campOpen = expanded[camp.id] ?? false;
          const zones = zoneScan?.zones ?? [];
          const allOn =
            zones.length > 0 && zones.every((z) => picks?.[z.no]?.mode === "all");
          const campState = !picks ? "off" : allOn ? "on" : "partial";

          return (
            <li key={camp.id} className="border-b border-line last:border-0">
              <div className="flex items-center gap-2.5 px-4 py-2.5">
                <Check
                  state={campState}
                  label={camp.name}
                  onChange={(on) => {
                    if (!on) setCamp(camp.id, [], false);
                    else if (zones.length)
                      setCamp(camp.id, zones.map((z) => z.no), true);
                    else requestCampAll(camp.id);
                  }}
                />

                <button
                  type="button"
                  onClick={() => toggleExpanded(camp.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">
                      {camp.name}
                    </span>
                    <span className="mt-px block truncate text-xs text-muted num">
                      {windowLabel(camp.window, camp.error)}
                    </span>
                  </span>
                  <Caret open={campOpen} />
                </button>
              </div>

              {campOpen && (
                <ul className="pb-1">
                  {!zoneScan && (
                    <li className="flex items-center gap-2 px-4 py-2 pl-11 text-xs text-muted">
                      <Spinner /> 구역 조회 중
                    </li>
                  )}

                  {zones.map((zone) => {
                    const pick = picks?.[zone.no];
                    const zoneKey = `${camp.id}::${zone.no}`;
                    const zoneOpen = expanded[zoneKey] ?? false;
                    const catalog = (roomScan?.rooms ?? []).filter(
                      (room) => room.zoneNo === zone.no,
                    );
                    const catalogNos = catalog.map((room) => room.no);
                    const chosen = new Set(selectedRooms(pick, catalogNos));

                    return (
                      <li key={zone.no}>
                        <div className="flex items-center gap-2.5 py-2 pr-4 pl-9">
                          <Check
                            state={
                              !pick ? "off" : pick.mode === "all" ? "on" : "partial"
                            }
                            label={`${camp.name} ${zone.name}`}
                            onChange={(on) => setZone(camp.id, zone.no, on)}
                          />
                          <button
                            type="button"
                            onClick={() => toggleExpanded(zoneKey)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">
                                {zone.name}
                              </span>
                              <span className="mt-px block truncate text-xs text-muted num">
                                {zone.total}면
                                {pick?.mode === "some" && ` · ${pick.rooms.length}개 선택`}
                                {zone.maxPeop > 0 && ` · ${zone.maxPeop}인`}
                              </span>
                            </span>
                            <Caret open={zoneOpen} />
                          </button>
                        </div>

                        {zoneOpen && (
                          <ul className="pb-1">
                            {!roomScan && (
                              <li className="flex items-center gap-2 py-1.5 pl-16 text-xs text-muted">
                                <Spinner /> 객실 조회 중
                              </li>
                            )}
                            {roomScan && !catalog.length && (
                              <li className="py-1.5 pr-4 pl-16 text-xs text-muted">
                                객실 목록이 없어요
                              </li>
                            )}
                            {catalog.map((room) => (
                              <li
                                key={room.no}
                                className="flex items-center gap-2.5 py-1.5 pr-4 pl-16"
                              >
                                <Check
                                  state={chosen.has(room.no) ? "on" : "off"}
                                  label={room.name}
                                  onChange={(on) =>
                                    setRoom(camp.id, zone.no, room.no, catalogNos, on)
                                  }
                                />
                                <span
                                  className={cx(
                                    "min-w-0 flex-1 truncate text-sm",
                                    !chosen.has(room.no) && "text-muted",
                                  )}
                                >
                                  {room.name}
                                </span>
                                <span className="shrink-0 text-xs text-subtle num">
                                  {wonShort(room.amount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}

        {!visible.length && (
          <li className="px-4 py-10 text-center text-sm text-muted">
            검색 결과가 없어요
          </li>
        )}
      </ul>
    </div>
  );
}
