"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Bounds, Pin } from "@/components/PlaceMap";
import { Check, Spinner, cx, wonShort } from "@/components/ui";
import { selectedRooms, type CampData } from "@/lib/availability";
import { formatMonthDay } from "@/lib/date";
import { placeOf, sidoOf, sidoRank } from "@/lib/places";
import type { BookingWindow } from "@/lib/types";
import { useSelection } from "@/store/selection";

/**
 * 포털이 알려준 기간과 한도를 그대로 적는다. 없는 값은 조각째 뺀다.
 * 아직 묻지 않았으면(undefined) 아무것도 적지 않는다 — 국립공원은 켜야 묻는다.
 */
function windowLabel(window: BookingWindow | null | undefined, error?: string) {
  if (window === undefined) return null;
  if (!window) return error ? "조회 실패" : "예약 기간 없음";
  return [
    `${formatMonthDay(window.start)}–${formatMonthDay(window.end)}`,
    window.maxStay != null && `최대 ${window.maxStay}박`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// maplibre-gl 은 무겁다. 시트를 열 때 받는다.
const PlaceMap = dynamic(() => import("@/components/PlaceMap"), { ssr: false });

function inside(bounds: Bounds | null, campId: string) {
  const place = placeOf(campId);
  // 좌표가 없는 캠핑장은 지도로 거를 수 없다. 늘 목록에 둔다.
  if (!bounds || !place) return true;
  return (
    place.lng >= bounds.west &&
    place.lng <= bounds.east &&
    place.lat >= bounds.south &&
    place.lat <= bounds.north
  );
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
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [focus, setFocus] = useState<string[]>([]);
  const list = useRef<HTMLUListElement>(null);

  const pickedCamps = Object.values(selection).filter(
    (zones) => Object.keys(zones).length > 0,
  ).length;

  const needle = query.trim().toLowerCase();
  const matched = useMemo(
    () =>
      data.filter(
        ({ camp, zoneScan, roomScan }) =>
          !needle ||
          [
            camp.name,
            sidoOf(camp.id),
            camp.portalLabel,
            ...(zoneScan?.zones ?? []).map((zone) => zone.name),
            ...(roomScan?.rooms ?? []).map((room) => room.name),
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle),
      ),
    [data, needle],
  );

  // 지도는 검색에 걸린 곳만 찍는다. 켠 캠핑장은 primary.
  const pins = useMemo<Pin[]>(
    () =>
      matched.flatMap(({ camp }) => {
        const place = placeOf(camp.id);
        if (!place) return [];
        const on = Object.keys(selection[camp.id] ?? {}).length > 0;
        return [{ id: camp.id, name: camp.name, lat: place.lat, lng: place.lng, on }];
      }),
    [matched, selection],
  );

  // 목록은 검색어가 있으면 검색 결과 전부, 없으면 지도에 보이는 곳이다. 지도를 움직여
  // "이 근처"를 고르고, 이름을 알면 검색이 지도를 거기로 옮긴다.
  // 지역(시도)으로 묶고 지역 안에서는 이름순이다. 포털 순서로 묶었더니 사용자가 모르는 구분
  // (고성군 · 국립공원 · Xticket)으로 나뉘었다. 사람은 "강원 쪽", "지리산"으로 찾는다.
  const visible = useMemo(
    () =>
      matched
        .filter(({ camp }) => needle || inside(bounds, camp.id))
        .toSorted(
          (a, b) =>
            sidoRank(sidoOf(a.camp.id)) - sidoRank(sidoOf(b.camp.id)) ||
            a.camp.name.localeCompare(b.camp.name, "ko"),
        ),
    [matched, needle, bounds],
  );
  const cropped = !needle && !mapFailed && visible.length < matched.length;

  // 검색어가 멈추면 지도를 걸린 곳에 맞춘다. 글자마다 움직이면 어지럽다.
  const [fitKey, setFitKey] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setFitKey(needle), 300);
    return () => clearTimeout(timer);
  }, [needle]);

  // 핀을 누르면 목록에서 그 캠핑장을 보여주고 잠깐 칠해 둔다.
  const pick = (ids: string[]) => {
    setFocus(ids);
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`[data-camp="${CSS.escape(ids[0])}"]`);
    if (!box || !row) return;
    // scrollIntoView 는 바깥(잠가 둔 페이지)까지 굴린다. 목록 상자만 움직인다.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({
      top: row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2,
      behavior: still ? "auto" : "smooth",
    });
  };
  useEffect(() => {
    if (!focus.length) return;
    const timer = setTimeout(() => setFocus([]), 1600);
    return () => clearTimeout(timer);
  }, [focus]);
  const regionSize = useMemo(() => {
    const size = new Map<string, number>();
    for (const { camp } of visible) size.set(sidoOf(camp.id), (size.get(sidoOf(camp.id)) ?? 0) + 1);
    return size;
  }, [visible]);

  return (
    <div className="flex h-full flex-col sm:flex-row">
      {!mapFailed && (
        <div className="relative h-64 shrink-0 border-b border-line bg-surface-2 sm:order-last sm:h-auto sm:flex-1 sm:border-b-0">
          <PlaceMap
            className="absolute inset-0"
            pins={pins}
            fitKey={fitKey}
            showReset={cropped}
            onBounds={setBounds}
            onPick={pick}
            onFail={() => setMapFailed(true)}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col sm:w-80 sm:flex-none sm:border-r sm:border-line">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="캠핑장 · 지역 · 구역"
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

      <ul ref={list} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        {visible.map(({ camp, zoneScan, roomScan }, index) => {
          const picks = selection[camp.id];
          const campOpen = expanded[camp.id] ?? false;
          const zones = zoneScan?.zones ?? [];
          const allOn =
            zones.length > 0 && zones.every((z) => picks?.[z.no]?.mode === "all");
          const campState = !picks ? "off" : allOn ? "on" : "partial";
          // 스캔이 받은 기간이 더 새롭다. 국립공원은 이것밖에 없다.
          const period = windowLabel(zoneScan ? zoneScan.window : camp.window, camp.error);
          const sido = sidoOf(camp.id);
          const regionHead = index === 0 || sidoOf(visible[index - 1].camp.id) !== sido ? sido : null;

          return (
            <li key={camp.id} className="border-b border-line last:border-0">
              {regionHead && (
                <h3 className="bg-surface-2 px-4 pt-4 pb-1.5 text-xs font-semibold text-muted">
                  {regionHead} <span className="font-normal num">{regionSize.get(regionHead)}</span>
                </h3>
              )}
              <div
                data-camp={camp.id}
                className={cx(
                  "flex items-center gap-2.5 px-4 py-2.5 transition-colors duration-(--dur-fast)",
                  focus.includes(camp.id) && "bg-surface-2",
                )}
              >
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
                      {[camp.portalLabel, period].filter(Boolean).join(" · ")}
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
                                {/* 정원을 모르면(대피소가 기간 내내 예약만료) 0 으로 적지 않고 뺀다. */}
                                {[
                                  zone.total > 0 && `${zone.total}${zone.unit ?? "면"}`,
                                  pick?.mode === "some" && `${pick.rooms.length}개 선택`,
                                  zone.maxPeop > 0 && `${zone.maxPeop}인`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
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
            {needle ? "검색 결과가 없어요" : "이 지도 안에는 캠핑장이 없어요"}
          </li>
        )}
      </ul>
      </div>
    </div>
  );
}
