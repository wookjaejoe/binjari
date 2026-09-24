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
import { DowSheet, NightsSheet, dowLabel } from "@/components/FilterSheets";
import { Legend } from "@/components/Legend";
import { Sheet, WIDE_POPOVER_WIDTH, anchorOf, type SheetAnchor } from "@/components/Sheet";
import { TargetPicker } from "@/components/TargetPicker";
import { Empty, Spinner, Switch, cx } from "@/components/ui";
import { DateMatrix } from "@/components/views/DateMatrix";
import { ZoneCards } from "@/components/ZoneCards";
import {
  buildRows,
  dateColumns,
  summarizeDays,
  type CampData,
} from "@/lib/availability";
import { dowIndex } from "@/lib/date";
import type { RoomScan, ZoneScan } from "@/lib/types";
import { DEFAULT_CAMP_IDS, REFRESH_INTERVAL } from "@/lib/defaults";
import { useCamps, useRoomScans, useZoneScans, type RoomRequest } from "@/lib/hooks";
import { usePendingSelection } from "@/lib/usePendingSelection";
import { useSelection } from "@/store/selection";

/** persist된 선택은 hydration 이후에만 신뢰할 수 있다. */
const noopSubscribe = () => () => {};

type SheetKind = "target" | "nights" | "dows";

type EmptyState =
  | { loading: true }
  | {
      loading?: false;
      title: string;
      /** [버튼 라벨, 여는 시트] */
      action?: [string, SheetKind];
    };

/**
 * 조건 버튼. 머리 띠(--ink) 위에 놓인다. 사용자가 정해 둔 조건 — 고른 대상, 기본값에서
 * 벗어난 숙박일수·요일 — 은 on-ink 로 꽉 채우고, 기본값 그대로인 조건은 옅은 채움이다.
 * 둘 다 채움이라 상자 높이가 같다.
 *
 * 라벨에 이미 `7박`이라고 적혀 있어도 기본값과 똑같이 생기면 걸려 있는 줄 모른다.
 * 결과가 비어 보일 때 먼저 의심할 곳이 여기다. 전에는 액센트 점을 찍었는데, 색을 늘리지
 * 않고 채움으로 말한다.
 */
function FilterButton({
  children,
  set,
  onClick,
}: {
  children: ReactNode;
  set: boolean;
  onClick: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => onClick(event.currentTarget)}
      className={cx(
        "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-sm whitespace-nowrap",
        set ? "bg-on-ink font-semibold text-ink" : "bg-on-ink/10 text-on-ink/75",
      )}
    >
      <span className="max-w-48 truncate">{children}</span>
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
    onlyOpen,
    dows,
    autoRefresh,
    selection,
    expanded,
    pendingAll,
    setNights,
    setOnlyOpen,
    setDows,
    setAutoRefresh,
    requestCampAll,
  } = useSelection();

  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [nonce, setNonce] = useState(0);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  // 조건 버튼으로 열면 데스크톱에서 그 버튼 아래에 붙는다. 다른 곳에서 열면 null.
  const [anchor, setAnchor] = useState<SheetAnchor | null>(null);
  const openSheet = (kind: SheetKind, from?: HTMLElement) => {
    // 대상 시트는 지도를 품어 넓다. 넓은 폭으로 자리를 잡아야 오른쪽 끝을 넘지 않는다.
    setAnchor(from ? anchorOf(from, kind === "target" ? WIDE_POPOVER_WIDTH : undefined) : null);
    setSheet(kind);
  };
  const [selected, setSelected] = useState<{
    campId: string | null;
    date: string;
  } | null>(null);
  const seeded = useRef(false);
  const queryClient = useQueryClient();

  const campsQuery = useCamps();
  const camps = useMemo(() => campsQuery.data?.camps ?? [], [campsQuery.data]);

  useEffect(() => {
    if (!mounted || seeded.current || !camps.length) return;
    seeded.current = true;
    if (Object.keys(selection).length > 0) return;
    for (const id of DEFAULT_CAMP_IDS) {
      if (camps.some((camp) => camp.id === id)) requestCampAll(id);
    }
  }, [mounted, camps, selection, requestCampAll]);

  const interestIds = useMemo(
    () =>
      camps
        .filter(
          (camp) =>
            selection[camp.id] ||
            expanded[camp.id] ||
            pendingAll.includes(camp.id),
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

  // 객실 조회의 첫 응답을 기다리는 캠핑장. 이게 없으면 객실을 펼치거나 일부만 고른 행이
  // 조회 중에 모름(`?`)으로 깜빡인다. 같은 렌더 안에서는 쿼리 배열이 요청 배열과 순서가 같다.
  const roomPending = new Set(
    roomRequests.filter((_, i) => roomScans[i]?.isPending).map((r) => r.campId),
  );
  const pendingKey = [...roomPending].join();

  const data = useMemo<CampData[]>(
    () =>
      camps
        .filter((camp) => interestIds.includes(camp.id))
        .map((camp) => ({
          camp,
          zoneScan: zoneById.get(camp.id),
          roomScan: roomById.get(camp.id),
          roomPending: roomPending.has(camp.id),
        })),
    // 집합은 매 렌더 새로 만들어지므로 내용으로 비교한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camps, interestIds, zoneById, roomById, pendingKey],
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
  const openDates = useMemo(
    () => summaries.filter((s) => s.open).map((s) => s.date),
    [summaries],
  );
  const openCount = openDates.length;
  const calendarDates = useMemo(() => summaries.map((s) => s.date), [summaries]);
  const dates = onlyOpen ? openDates : calendarDates;

  // 빈 상태는 앱이 아는 사실만 말한다 — 고른 것이 없거나, 빈 날만 보는데 빈 날이
  // 없거나. 원인 추정도 대안 제시도 없다. 조회 중에는 "없어요"를 띄우지 않는다.
  const pending = zoneScans.some((q) => q.isPending);
  const empty = ((): EmptyState | null => {
    if (rows.length && !(onlyOpen && openCount === 0)) return null;
    if (pending) return { loading: true };
    if (!rows.length) {
      return { title: "고른 대상이 없어요", action: ["대상 고르기", "target"] };
    }
    return { title: "빈자리가 없어요" };
  })();

  const picked = Object.values(selection).some((zones) => Object.keys(zones).length > 0);
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
      <main className="min-h-dvh">
        <div className="bg-ink">
          <div className="mx-auto max-w-3xl px-5 pt-4 pb-14">
            <div className="h-7 w-20 animate-pulse rounded-sm bg-on-ink/10" />
            <div className="mt-4 h-10 w-full animate-pulse rounded-full bg-on-ink/10" />
          </div>
        </div>
        <div className="relative -mt-7 h-dvh rounded-t-2xl bg-bg" />
      </main>
    );
  }

  return (
    <main className="min-h-dvh">
      {/* 본문 패널이 머리 띠 위로 7(28px)만큼 올라와 겹친다. 패널의 둥근 모서리 뒤로 머리 띠가
          비친다. 둘을 이어 붙이거나 한 바닥에 얹으면 경계에 머리카락 선이 떴다. */}
      <div>
        <header className="bg-ink text-on-ink">
          <div className="mx-auto max-w-3xl px-5 pt-4 pb-14">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">빈자리</h1>
              <span className="text-xs text-on-ink/55">공공 캠핑장 · 대피소</span>
              <div className="ml-auto flex items-center gap-1 text-xs text-on-ink/55">
                {scanning ? (
                  <Spinner onInk />
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
                  className="flex size-8 items-center justify-center rounded-full text-on-ink/75 active:bg-on-ink/10"
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

            {/* 헤드라인은 두지 않는다. "102일 중 98일 빈자리가 있어요" 같은 일수 합계를 올렸었는데,
                구역을 여러 개 고르면 거의 매일 어딘가는 비어 숫자가 기간 길이를 따라갈 뿐이었다.
                제목으로 삼을 답이 없으면 제목을 비운다. 답은 카드와 표가 한다. */}
            <div className="rail -mx-5 mt-4 flex gap-2 px-5">
              <FilterButton set={picked} onClick={(button) => openSheet("target", button)}>
                {targetSummary}
              </FilterButton>
              <FilterButton set={nights !== 1} onClick={(button) => openSheet("nights", button)}>
                {nights}박
              </FilterButton>
              <FilterButton set={dows.length > 0} onClick={(button) => openSheet("dows", button)}>
                {dowLabel(dows)}
              </FilterButton>
            </div>
          </div>
        </header>

        <div className="relative -mt-7 rounded-t-2xl bg-bg">
          <div className="mx-auto max-w-3xl pt-6 pb-16">
            {errorMessage && (
              <p className="mx-5 mb-4 rounded-lg bg-surface px-4 py-3 text-xs text-error elev-card">
                조회에 실패했어요.
              </p>
            )}

            {!empty && (
              <ZoneCards
                rows={rows}
                dates={calendarDates}
                data={data}
                selection={selection}
                onPick={(campId, date) => setSelected({ campId, date })}
              />
            )}

            <section>
              {!empty && <h2 className="px-5 pb-3 text-lg font-bold">날짜별로 보기</h2>}
              <div className="mx-5 overflow-hidden rounded-xl bg-surface elev-card">
                {empty?.loading && (
                  <div className="flex justify-center px-6 py-14">
                    <Spinner />
                  </div>
                )}
                {empty && !empty.loading && (
                  <Empty
                    title={empty.title}
                    action={
                      empty.action && (
                        <button
                          type="button"
                          onClick={() => openSheet(empty.action![1])}
                          className="mt-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-on-ink"
                        >
                          {empty.action[0]}
                        </button>
                      )
                    }
                  />
                )}
                {!empty && (
                  <DateMatrix
                    rows={rows}
                    dates={dates}
                    data={data}
                    selection={selection}
                    selected={selected}
                    firstOpenDate={openDates[0] ?? null}
                    onPick={(campId, date) => setSelected({ campId, date })}
                  />
                )}
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <Legend />
              <div className="flex items-center gap-4">
                <Switch checked={onlyOpen} onChange={setOnlyOpen}>
                  빈 날만
                </Switch>
                <Switch checked={autoRefresh} onChange={setAutoRefresh}>
                  자동 갱신
                </Switch>
              </div>
            </div>

            <p className="px-5 text-center text-xs leading-relaxed text-subtle">
              캠핑장마다 원래 예약 사이트의 공개 정보예요. 예약과 결제는 원 사이트에서 해요.
            </p>
          </div>
        </div>
      </div>

      <Sheet
        open={sheet === "target"}
        onClose={() => setSheet(null)}
        title="조회 대상"
        anchor={anchor}
        wide
      >
        <TargetPicker data={pickerData} />
      </Sheet>

      <NightsSheet
        open={sheet === "nights"}
        nights={nights}
        anchor={anchor}
        onClose={() => setSheet(null)}
        onPick={setNights}
      />

      <DowSheet
        open={sheet === "dows"}
        dows={dows}
        anchor={anchor}
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
