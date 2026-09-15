"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ZoneSelection = { mode: "all" } | { mode: "some"; rooms: string[] };

type State = {
  nights: number;
  onlyOpen: boolean;
  /** 체크인 요일 필터. 빈 배열은 제한 없음. 0=일 … 6=토 */
  dows: number[];
  autoRefresh: boolean;
  /** campId → zoneNo → 선택 상태. 없는 키는 선택 해제. */
  selection: Record<string, Record<string, ZoneSelection>>;
  expanded: Record<string, boolean>;
  /** 구역 목록이 도착하면 구역 전부를 켤 캠핑장 */
  pendingAll: string[];
};

type Actions = {
  setNights: (nights: number) => void;
  setOnlyOpen: (onlyOpen: boolean) => void;
  setDows: (dows: number[]) => void;
  setAutoRefresh: (autoRefresh: boolean) => void;
  toggleExpanded: (key: string) => void;
  setCamp: (campId: string, zoneNos: string[], on: boolean) => void;
  requestCampAll: (campId: string) => void;
  resolvePendingAll: (campId: string, zoneNos: string[]) => void;
  setZone: (campId: string, zoneNo: string, on: boolean) => void;
  setRoom: (
    campId: string,
    zoneNo: string,
    roomNo: string,
    allRooms: string[],
    on: boolean,
  ) => void;
  clearAll: () => void;
};

/** localStorage에 남기는 부분. pendingAll은 세션 한정이라 제외한다. */
type Persisted = Omit<State, "pendingAll">;

function prune(camp: Record<string, ZoneSelection>) {
  return Object.keys(camp).length ? camp : undefined;
}

export const useSelection = create<State & Actions>()(
  persist(
    (set, get) => ({
      nights: 1,
      onlyOpen: false,
      dows: [],
      autoRefresh: true,
      selection: {},
      expanded: {},
      pendingAll: [],

      setNights: (nights) => set({ nights }),
      setOnlyOpen: (onlyOpen) => set({ onlyOpen }),
      setDows: (dows) =>
        set({ dows: dows.length === 7 ? [] : [...dows].sort((a, b) => a - b) }),
      setAutoRefresh: (autoRefresh) => set({ autoRefresh }),

      toggleExpanded: (key) =>
        set((s) => ({ expanded: { ...s.expanded, [key]: !s.expanded[key] } })),

      setCamp: (campId, zoneNos, on) =>
        set((s) => {
          const next = { ...s.selection };
          if (!on) delete next[campId];
          else {
            next[campId] = Object.fromEntries(
              zoneNos.map((no) => [no, { mode: "all" } as ZoneSelection]),
            );
          }
          return { selection: next };
        }),

      requestCampAll: (campId) =>
        set((s) => ({
          pendingAll: s.pendingAll.includes(campId)
            ? s.pendingAll
            : [...s.pendingAll, campId],
        })),

      // 구역이 하나도 안 왔으면 대기를 유지한다. 전 날짜 실패 같은 일시적 상황에서
      // 요청을 버리면 사용자가 켠 캠핑장이 조용히 사라진다.
      resolvePendingAll: (campId, zoneNos) => {
        const state = get();
        if (!state.pendingAll.includes(campId) || !zoneNos.length) return;
        const pendingAll = state.pendingAll.filter((id) => id !== campId);
        set({
          pendingAll,
          selection: {
            ...state.selection,
            [campId]: Object.fromEntries(
              zoneNos.map((no) => [no, { mode: "all" } as ZoneSelection]),
            ),
          },
        });
      },

      setZone: (campId, zoneNo, on) =>
        set((s) => {
          const camp = { ...(s.selection[campId] ?? {}) };
          if (on) camp[zoneNo] = { mode: "all" };
          else delete camp[zoneNo];
          const next = { ...s.selection };
          const kept = prune(camp);
          if (kept) next[campId] = kept;
          else delete next[campId];
          return { selection: next };
        }),

      setRoom: (campId, zoneNo, roomNo, allRooms, on) =>
        set((s) => {
          const camp = { ...(s.selection[campId] ?? {}) };
          const current = camp[zoneNo];
          const chosen = new Set(
            current == null
              ? []
              : current.mode === "all"
                ? allRooms
                : current.rooms,
          );

          if (on) chosen.add(roomNo);
          else chosen.delete(roomNo);

          if (chosen.size === 0) delete camp[zoneNo];
          else if (allRooms.length > 0 && chosen.size === allRooms.length) {
            camp[zoneNo] = { mode: "all" };
          } else {
            camp[zoneNo] = {
              mode: "some",
              rooms: allRooms.filter((no) => chosen.has(no)),
            };
          }

          const next = { ...s.selection };
          const kept = prune(camp);
          if (kept) next[campId] = kept;
          else delete next[campId];
          return { selection: next };
        }),

      clearAll: () => set({ selection: {}, pendingAll: [] }),
    }),
    {
      name: "binjari-selection",
      // 4: 뷰가 하나가 되면서 view 필드를 버린다.
      version: 4,
      migrate: (persisted, version): Persisted => {
        const old = (persisted ?? {}) as Partial<Persisted> & {
          weekendOnly?: boolean;
        };
        return {
          nights: old.nights ?? 1,
          onlyOpen: old.onlyOpen ?? false,
          dows: old.dows ?? (version < 3 && old.weekendOnly ? [5, 6] : []),
          autoRefresh: old.autoRefresh ?? true,
          selection: old.selection ?? {},
          expanded: old.expanded ?? {},
        };
      },
      partialize: (state) => ({
        nights: state.nights,
        onlyOpen: state.onlyOpen,
        dows: state.dows,
        autoRefresh: state.autoRefresh,
        selection: state.selection,
        expanded: state.expanded,
      }),
    },
  ),
);
