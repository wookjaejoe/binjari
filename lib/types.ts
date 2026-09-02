import type { BookingWindow, Room, Zone } from "@/lib/providers/types";

export type { BookingTarget, BookingWindow, Room, Zone } from "@/lib/providers/types";

export type ZoneScan = {
  campId: string;
  campName: string;
  nights: number;
  window: BookingWindow | null;
  /** nights가 이 캠핑장의 최대 숙박일수를 넘어선 경우 */
  tooManyNights: boolean;
  dates: string[];
  zones: Zone[];
  counts: Record<string, Record<string, number>>;
  amounts: Record<string, Record<string, number | null>>;
  failedDates: string[];
  generatedAt: string;
};

export type RoomScan = {
  campId: string;
  nights: number;
  rooms: Room[];
  available: Record<string, string[]>;
  /** 조회 기간 내내 마감이라 객실 목록을 얻지 못한 존 */
  zonesWithoutCatalog: string[];
  generatedAt: string;
};

export type CampStatus = "open" | "preparing" | "unopened";

export type CampProfile = {
  id: string;
  name: string;
  portalId: string;
  portalLabel: string;
  window: BookingWindow | null;
  status: CampStatus;
  zoneCount: number;
  roomCount: number;
};
