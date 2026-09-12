"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { DayDetail } from "@/components/DayDetail";
import { Highlight } from "@/components/Highlight";
import { DowSheet, NightsSheet, dowLabel } from "@/components/FilterSheets";
import { Legend } from "@/components/Legend";
import { Sheet } from "@/components/Sheet";
import { TargetPicker } from "@/components/TargetPicker";
import { SegBar, Skeleton, Spinner, Switch, cx } from "@/components/ui";
import { DateMatrix } from "@/components/views/DateMatrix";
import { DayStream } from "@/components/views/DayStream";
import { HeatGrid } from "@/components/views/HeatGrid";
import {
  buildRows,
  dateColumns,
  summarizeDays,
  type CampData,
} from "@/lib/availability";
import { dowIndex } from "@/lib/date";
import type { RoomScan, ZoneScan } from "@/lib/types";
import { DEFAULT_CAMP_IDS, REFRESH_INTERVAL } from "@/lib/defaults";
import { buildValidMap } from "@/lib/selection";
import { useCamps, useRoomScans, useZoneScans, type RoomRequest } from "@/lib/hooks";
import { usePendingSelection } from "@/lib/usePendingSelection";
import { VIEWS, normalizeView } from "@/lib/views";
import { useSelection } from "@/store/selection";

/** persist된 선택은 hydration 이후에만 신뢰할 수 있다. */
const noopSubscribe = () => () => {};

function FilterButton({
  children,
  primary,
  onClick,
}: {
  children: ReactNode;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex min-w-0 items-center gap-1 rounded-full border px-3 py-2 text-xs whitespace-nowrap",
        primary
          ? "flex-1 justify-between border-line bg-surface font-medium text-fg"
          : "shrink-0 border-line text-muted",
      )}
    >
      <span className="truncate">{children}</span>
      <svg viewBox="0 0 10 10" className="size-2.5 shrink-0 opacity-60" aria-hidden>
        <path
          d="M2 3.5L5 6.5l3-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export default function Page() {
  const {
    nights,
    view: storedView,
    onlyOpen,
    dows,
    autoRefresh,
    selection,
    expanded,
    pendingAll,
    setNights,
    setView,
    setOnlyOpen,
    setDows,
    setAutoRefresh,
    requestCampAll,
    reconcile,
  } = useSelection();

  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [nonce, setNonce] = useState(0);
  const [sheet, setSheet] = useState<"target" | "nights" | "dows" | null>(null);
  const [selected, setSelected] = useState<{
    campId: string | null;
    date: string;
  } | null>(null);
  const seeded = useRef(false);
  const queryClient = useQueryClient();

  const view = normalizeView(storedView);
  useEffect(() => {
    if (view !== storedView) setView(view);
  }, [view, storedView, setView]);

  const campsQuery = useCamps();
  const camps = useMemo(() => campsQuery.data?.camps ?? [], [campsQuery.data]);

  useEffect(() => {
    if (!mounted || seeded.current || !camps.length) return;
    seeded.current = true;
    if (Object.keys(selection).length > 0) return;
    for (const id of DEFAULT_CAMP_IDS) {
      if (camps.some((camp) => camp.id === id && camp.status === "open")) {
        requestCampAll(id, "compact");
      }
    }
  }, [mounted, camps, selection, requestCampAll]);

  const interestIds = useMemo(
    () =>
      camps
        .filter(
          (camp) =>
            selection[camp.id] ||
            expanded[camp.id] ||
            pendingAll.some((p) => p.campId === camp.id),
        )
        .map((camp) => camp.id),
    [camps, selection, expanded, pendingAll],
  );

  const interval = autoRefresh ? REFRESH_INTERVAL : false;
  const zoneScans = useZoneScans(interestIds, nights, interval, nonce);

  const roomRequests = useMemo<RoomRequest[]>(() => {
    const requests: RoomRequest[] = [];
    interestIds.forEach((campId, index) => {
      const wanted = new Set<string>();
      for (const [zoneNo, pick] of Object.entries(selection[campId] ?? {})) {
        if (pick.mode === "some") wanted.add(zoneNo);
      }
      for (const zone of zoneScans[index]?.data?.zones ?? []) {
        if (expanded[`${campId}::${zone.no}`]) wanted.add(zone.no);
      }
      if (wanted.size) requests.push({ campId, zones: [...wanted].sort() });
    });
    return requests;
  }, [interestIds, selection, expanded, zoneScans]);

  const roomScans = useRoomScans(roomRequests, nights, interval, nonce);

  // 결과를 배열 인덱스로 찾으면 요청 목록이 바뀌는 렌더에서 어긋날 수 있다.
  // 스캔 응답이 campId를 담고 있으니 그것으로 직접 맞춘다.
  const zoneById = useMemo(() => {
    const map = new Map<string, ZoneScan>();
    for (const query of zoneScans) if (query.data) map.set(query.data.campId, query.data);
    return map;
  }, [zoneScans]);

  const roomById = useMemo(() => {
    const map = new Map<string, RoomScan>();
    for (const query of roomScans) if (query.data) map.set(query.data.campId, query.data);
    return map;
  }, [roomScans]);

  const data = useMemo<CampData[]>(
    () =>
      camps
        .filter((camp) => interestIds.includes(camp.id))
        .map((camp) => ({
          camp,
          zoneScan: zoneById.get(camp.id),
          roomScan: roomById.get(camp.id),
        })),
    [camps, interestIds, zoneById, roomById],
  );

  const pickerData = useMemo<CampData[]>(
    () =>
      camps.map((camp) => ({
        camp,
        zoneScan: zoneById.get(camp.id),
        roomScan: roomById.get(camp.id),
      })),
    [camps, zoneById, roomById],
  );

  usePendingSelection(data);

  // 저장된 선택은 지난 방문의 것이다. 운영이 멈춘 캠핑장이나 사라진 구역이
  // 남아 있으면 결과에 섞이므로, 목록이 도착할 때마다 현재 기준으로 정리한다.
  useEffect(() => {
    if (!camps.length) return;
    reconcile(buildValidMap(camps, zoneById));
  }, [camps, zoneById, reconcile]);

  const rows = useMemo(
    () => buildRows(data, selection, expanded),
    [data, selection, expanded],
  );
  const allDates = useMemo(() => dateColumns(data), [data]);
  const allSummaries = useMemo(
    () => summarizeDays(allDates, rows, data, selection),
    [allDates, rows, data, selection],
  );
  const summaries = useMemo(
    () =>
      dows.length
        ? allSummaries.filter((s) => dows.includes(dowIndex(s.date)))
        : allSummaries,
    [allSummaries, dows],
  );
  const dates = useMemo(() => summaries.map((s) => s.date), [summaries]);
  const openCount = summaries.filter((s) => s.openRows > 0).length;
  const matrixDates = onlyOpen
    ? summaries.filter((s) => s.openRows > 0).map((s) => s.date)
    : dates;

  const targetSummary = useMemo(() => {
    const picked = Object.values(selection).filter(
      (zones) => Object.keys(zones).length > 0,
    );
    if (!picked.length) return "대상 선택";
    const zoneCount = picked.reduce((sum, zones) => sum + Object.keys(zones).length, 0);
    const roomPick = picked
      .flatMap((zones) => Object.values(zones))
      .filter((pick) => pick.mode === "some").length;
    return `${picked.length}곳 · ${zoneCount}구역${roomPick ? ` · 객실 ${roomPick}` : ""}`;
  }, [selection]);

  const scanning =
    zoneScans.some((q) => q.isFetching) || roomScans.some((q) => q.isFetching);
  const errorMessage =
    campsQuery.error?.message ?? zoneScans.find((q) => q.error)?.error?.message;
  const stamp = zoneScans
    .map((q) => q.data?.generatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  const refresh = () => {
    setNonce((value) => value + 1);
    queryClient.invalidateQueries({ queryKey: ["scan"] });
  };

  if (!mounted) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-3 h-12 w-full" />
        <Skeleton className="mt-3 h-40 w-full" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl pb-16">
      <div className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <h1 className="text-xl font-semibold">빈자리</h1>
          <span className="text-xs text-subtle">고성군 공공캠핑장</span>
          <div className="ml-auto flex items-center gap-2 text-xs text-subtle">
            {scanning ? (
              <Spinner />
            ) : (
              stamp && (
                <span className="num">
                  {new Date(stamp).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )
            )}
            <button
              type="button"
              onClick={refresh}
              aria-label="새로고침"
              className="flex size-8 items-center justify-center rounded-sm text-muted active:bg-surface-2"
            >
              <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden>
                <path
                  d="M12 7a5 5 0 1 1-1.6-3.7M12 1.5V4h-2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-4 pb-2.5">
          <FilterButton primary onClick={() => setSheet("target")}>
            {targetSummary}
          </FilterButton>
          <FilterButton onClick={() => setSheet("nights")}>{nights}박</FilterButton>
          <FilterButton onClick={() => setSheet("dows")}>
            {dowLabel(dows)}
          </FilterButton>
        </div>
      </div>

      {errorMessage && (
        <p
          className="mx-4 mt-3 rounded-md border border-line bg-surface px-3 py-2.5 text-xs text-warn"
        >
          지금은 조회가 안 돼요. 잠시 뒤 다시 해 볼게요.
        </p>
      )}

      <Highlight
        summaries={allSummaries}
        rows={rows}
        data={data}
        selection={selection}
        activeDows={dows}
        nights={nights}
        onPick={(date) => setSelected({ campId: null, date })}
      />

      <div className="mt-6 flex items-center justify-between gap-3 px-4 py-2.5">
        <SegBar value={view} options={VIEWS} onChange={setView} size="sm" />
        <span className="text-xs text-muted num">
          가능 <strong className="font-semibold text-fg">{openCount}</strong>일
        </span>
      </div>

      <div className="mx-3 overflow-hidden rounded-md border border-line bg-surface">
        {view === "heat" && (
          <HeatGrid
            summaries={allSummaries}
            activeDows={dows}
            selectedDate={selected?.date ?? null}
            onPick={(date) => setSelected({ campId: null, date })}
          />
        )}
        {view === "stream" && (
          <DayStream
            rows={rows}
            dates={dates}
            data={data}
            selection={selection}
            nights={nights}
            selectedDate={selected?.date ?? null}
            onPick={(date) => setSelected({ campId: null, date })}
          />
        )}
        {view === "matrix" && (
          <DateMatrix
            rows={rows}
            dates={matrixDates}
            data={data}
            selection={selection}
            selected={selected}
            onPick={(campId, date) => setSelected({ campId, date })}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Legend />
        <div className="flex items-center gap-4">
          {view === "matrix" && (
            <Switch checked={onlyOpen} onChange={setOnlyOpen}>
              빈 날만
            </Switch>
          )}
          <Switch checked={autoRefresh} onChange={setAutoRefresh}>
            자동 갱신
          </Switch>
        </div>
      </div>

      <p className="px-4 text-center text-xs leading-relaxed text-subtle">
        pubcamping.kr의 공개 정보예요. 예약과 결제는 원 사이트에서 해요.
      </p>

      <Sheet
        open={sheet === "target"}
        onClose={() => setSheet(null)}
        title="조회 대상"
      >
        <TargetPicker data={pickerData} />
      </Sheet>

      <NightsSheet
        open={sheet === "nights"}
        nights={nights}
        camps={camps.filter((camp) => selection[camp.id])}
        onClose={() => setSheet(null)}
        onPick={setNights}
      />

      <DowSheet
        open={sheet === "dows"}
        dows={dows}
        onClose={() => setSheet(null)}
        onChange={setDows}
      />

      <DayDetail
        selected={selected}
        rows={rows}
        data={data}
        selection={selection}
        nights={nights}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}
