"use client";

import { useMemo, useState } from "react";

import { Check, Spinner, cx, wonShort } from "@/components/ui";
import { selectedRooms, type CampData } from "@/lib/availability";
import { useSelection } from "@/store/selection";

const STATUS_LABEL = {
  preparing: "예약 준비 중",
  unopened: "예약 미오픈",
} as const;

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
    nights,
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
          placeholder="캠핑장 · 구역 · 객실 이름으로 찾기"
          className="min-w-0 flex-1 rounded-md bg-surface-2 px-3 py-2 text-[13px] outline-none placeholder:text-subtle"
        />
        {pickedCamps > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 text-[11.5px] whitespace-nowrap text-muted active:text-fg"
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
          const blocked = camp.status !== "open";
          const allOn =
            zones.length > 0 && zones.every((z) => picks?.[z.no]?.mode === "all");
          const campState = !picks ? "off" : allOn ? "on" : "partial";
          const overStay = zoneScan?.tooManyNights;

          return (
            <li key={camp.id} className="border-b border-line last:border-0">
              <div className="flex items-center gap-2.5 px-4 py-2.5">
                {blocked ? (
                  <span className="size-[18px] shrink-0 rounded-[5px] border border-line" />
                ) : (
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
                )}

                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => toggleExpanded(camp.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cx(
                        "block truncate text-[13.5px] font-medium",
                        blocked && "text-subtle",
                      )}
                    >
                      {camp.name}
                    </span>
                    <span className="mt-px block truncate text-[11px] text-muted num">
                      {blocked
                        ? STATUS_LABEL[camp.status as "preparing" | "unopened"]
                        : camp.window
                          ? `${camp.window.start.slice(5).replace("-", ".")}–${camp.window.end.slice(5).replace("-", ".")} · 최대 ${camp.window.maxStay}박 · ${camp.roomCount}면`
                          : ""}
                    </span>
                  </span>
                  {!blocked && <Caret open={campOpen} />}
                </button>
              </div>

              {overStay && (
                <p className="px-4 pb-2.5 text-[11px] text-warn">
                  {`최대 ${camp.window?.maxStay}박까지만 예약할 수 있어 ${nights}박 결과가 없습니다.`}
                </p>
              )}

              {campOpen && !blocked && (
                <ul className="pb-1">
                  {!zoneScan && (
                    <li className="flex items-center gap-2 px-4 py-2 pl-11 text-[11.5px] text-muted">
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
                    const noCatalog = roomScan?.zonesWithoutCatalog.includes(zone.no);

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
                              <span className="block truncate text-[13px]">
                                {zone.name}
                              </span>
                              <span className="mt-px block truncate text-[11px] text-muted num">
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
                              <li className="flex items-center gap-2 py-1.5 pl-[70px] text-[11.5px] text-muted">
                                <Spinner /> 객실 조회 중
                              </li>
                            )}
                            {roomScan && noCatalog && (
                              <li className="py-1.5 pr-4 pl-[70px] text-[11.5px] leading-relaxed text-muted">
                                조회 기간 내내 마감이라 개별 객실을 확인할 수 없습니다.
                              </li>
                            )}
                            {catalog.map((room) => (
                              <li
                                key={room.no}
                                className="flex items-center gap-2.5 py-1.5 pr-4 pl-[62px]"
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
                                    "min-w-0 flex-1 truncate text-[12.5px]",
                                    !chosen.has(room.no) && "text-muted",
                                  )}
                                >
                                  {room.name}
                                </span>
                                <span className="shrink-0 text-[11px] text-subtle num">
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
          <li className="px-4 py-10 text-center text-[12.5px] text-muted">
            검색 결과가 없습니다
          </li>
        )}
      </ul>
    </div>
  );
}
