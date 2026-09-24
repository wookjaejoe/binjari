"use client";

import { useQueries, useQuery } from "@tanstack/react-query";

import type { BookingTarget, CampProfile, RoomScan, ZoneScan } from "@/lib/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function useCamps() {
  return useQuery({
    queryKey: ["camps"],
    queryFn: () => getJson<{ camps: CampProfile[] }>("/api/camps"),
    staleTime: 15 * 60_000,
  });
}

export function useZoneScans(
  campIds: string[],
  nights: number,
  refetchInterval: number | false,
  nonce = 0,
) {
  return useQueries({
    queries: campIds.map((campId) => ({
      queryKey: ["scan", "zones", campId, nights, nonce],
      queryFn: () =>
        getJson<ZoneScan>(
          `/api/scan/zones?camp=${encodeURIComponent(campId)}&nights=${nights}` +
            (nonce > 0 ? "&fresh=1" : ""),
        ),
      refetchInterval,
    })),
  });
}

export type RoomRequest = { campId: string; zones: string[] };

export function useRoomScans(
  requests: RoomRequest[],
  nights: number,
  refetchInterval: number | false,
  nonce = 0,
) {
  return useQueries({
    queries: requests.map(({ campId, zones }) => {
      const key = [...zones].sort().join(",");
      return {
        queryKey: ["scan", "rooms", campId, nights, key, nonce],
        queryFn: () =>
          getJson<RoomScan>(
            `/api/scan/rooms?camp=${encodeURIComponent(campId)}&nights=${nights}&zones=${encodeURIComponent(key)}`,
          ),
        refetchInterval,
      };
    }),
  });
}

export function useBookingTarget(
  campId: string | null,
  date: string | null,
  nights: number,
) {
  return useQuery({
    queryKey: ["booking", campId, date, nights],
    queryFn: () =>
      getJson<BookingTarget>(
        `/api/booking?camp=${encodeURIComponent(campId!)}&date=${date}&nights=${nights}`,
      ),
    enabled: Boolean(campId && date),
    staleTime: 60 * 60_000,
  });
}
