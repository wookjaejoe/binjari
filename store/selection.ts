"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ZoneSelection = { mode: "all" } | { mode: "some"; rooms: string[] };

export type ViewMode = "stream" | "month" | "matrix";

type State = {
  nights: number;
  view: ViewMode;
  onlyOpen: boolean;
  weekendOnly: boolean;
  autoRefresh: boolean;
  /** campId → zoneNo → 선택 상태. 없는 키는 선택 해제. */
  selection: Record<string, Record<string, ZoneSelection>>;
  expanded: Record<string, boolean>;
  /** 구역 목록이 도착하면 선택을 채울 캠핑장. compact는 소규모 구역만. */
  pendingAll: { campId: string; scope: "all" | "compact" }[];
};

type Actions = {
  setNights: (nights: number) => void;
  setView: (view: ViewMode) => void;
  setOnlyOpen: (onlyOpen: boolean) => void;
  setWeekendOnly: (weekendOnly: boolean) => void;
  setAutoRefresh: (autoRefresh: boolean) => void;
  toggleExpanded: (key: string) => void;
  setCamp: (campId: string, zoneNos: string[], on: boolean) => void;
  requestCampAll: (campId: string, scope?: "all" | "compact") => void;
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
    (set) => ({
      nights: 1,
      view: "stream",
      onlyOpen: false,
      weekendOnly: false,
      autoRefresh: true,
      selection: {},
      expanded: {},
      pendingAll: [],

      setNights: (nights) => set({ nights }),
      setView: (view) => set({ view }),
      setOnlyOpen: (onlyOpen) => set({ onlyOpen }),
      setWeekendOnly: (weekendOnly) => set({ weekendOnly }),
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

      requestCampAll: (campId, scope = "all") =>
        set((s) => ({
          pendingAll: s.pendingAll.some((p) => p.campId === campId)
            ? s.pendingAll
            : [...s.pendingAll, { campId, scope }],
          expanded:
            scope === "all" ? { ...s.expanded, [campId]: true } : s.expanded,
        })),

      resolvePendingAll: (campId, zoneNos) =>
        set((s) => ({
          pendingAll: s.pendingAll.filter((p) => p.campId !== campId),
          selection: {
            ...s.selection,
            [campId]: Object.fromEntries(
              zoneNos.map((no) => [no, { mode: "all" } as ZoneSelection]),
            ),
          },
        })),

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
      name: "camping-finder-selection",
      version: 2,
      migrate: (persisted, version): Persisted => {
        const old = (persisted ?? {}) as Partial<Persisted>;
        return {
          nights: old.nights ?? 1,
          view: version >= 2 && old.view ? old.view : "stream",
          onlyOpen: old.onlyOpen ?? false,
          weekendOnly: old.weekendOnly ?? false,
          autoRefresh: old.autoRefresh ?? true,
          selection: old.selection ?? {},
          expanded: old.expanded ?? {},
        };
      },
      partialize: (state) => ({
        nights: state.nights,
        view: state.view,
        onlyOpen: state.onlyOpen,
        weekendOnly: state.weekendOnly,
        autoRefresh: state.autoRefresh,
        selection: state.selection,
        expanded: state.expanded,
      }),
    },
  ),
);
