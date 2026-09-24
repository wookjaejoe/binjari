import type { BookingWindow, Room, Zone } from "@/lib/providers/types";

export type { BookingTarget, BookingWindow, Room, Zone } from "@/lib/providers/types";

export type ZoneScan = {
  campId: string;
  campName: string;
  nights: number;
  /** null 이면 포털이 기간을 주지 않은 것. 요청 자체가 실패했으면 error 에 사유가 있다. */
  window: BookingWindow | null;
  /** 물어본 날짜 전부. 실패한 날짜도 들어 있다 — 그래야 그 열이 "모름"으로 남는다. */
  dates: string[];
  /** 성공한 날짜 응답들의 합집합. 먼저 본 값을 유지한다. */
  zones: Zone[];
  counts: Record<string, Record<string, number>>;
  amounts: Record<string, Record<string, number | null>>;
  failedDates: string[];
  generatedAt: string;
};

export type RoomScan = {
  campId: string;
  nights: number;
  /** 성공한 응답들의 합집합 */
  rooms: Room[];
  /** date → 그 날짜에 성공한 응답이 열려 있다고 한 객실 번호 */
  available: Record<string, string[]>;
  /** zoneNo → 조회에 실패한 날짜. 마감과 구분해 "모름"으로 그리기 위해 둔다. */
  failed: Record<string, string[]>;
  generatedAt: string;
};

export type CampProfile = {
  id: string;
  name: string;
  portalId: string;
  portalLabel: string;
  /**
   * undefined 면 아직 묻지 않은 것이다 — 기간을 묻는 값이 비싼 포털은 캠핑장을 켰을 때
   * 스캔이 묻는다(ZoneScan.window). null 이면 물었는데 기간이 없거나 실패했다.
   */
  window?: BookingWindow | null;
  /** window 가 null 일 때 그 사유. HTTP 상태처럼 사실만 적는다. */
  error?: string;
};
