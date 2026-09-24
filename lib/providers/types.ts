export type ProviderId =
  | "pubcamping"
  | "knps"
  | "knpsShelter"
  | "xticket"
  | "moonhwain"
  | "yesan"
  | "rsvasp"
  | "gmuc"
  | "maketicket";

export type Portal = {
  id: string;
  host: string;
  label: string;
  provider: ProviderId;
};

export type CampRef = {
  id: string;
  portalId: string;
  slug: string;
  name: string;
};

/**
 * 포털이 예약을 열어 둔 기간. maxStay·minStay 는 포털이 알려준 값을 그대로 보여주기
 * 위한 것이지 판단 근거가 아니다 — 이 범위를 넘겨 물어도 포털은 오류 없이 0 을 준다.
 * 포털이 안 주면 null 로 두고 1 같은 값으로 메우지 않는다.
 */
export type BookingWindow = {
  start: string;
  end: string;
  maxStay: number | null;
  minStay: number | null;
};

export type Zone = {
  no: string;
  name: string;
  total: number;
  /** total·잔여를 세는 단위. 없으면 "면"(영지·사이트). 대피소는 "자리"다. */
  unit?: string;
  size: string;
  maxPeop: number;
  order: number;
  /** 구역 대표 사진(절대 URL). 포털이 안 주는 구역도 있다. */
  photo: string | null;
  /** 바닥 — "데크" · "잔디" · "맨흙" · "혼합" */
  ground: string;
};

export type ZoneDay = {
  zones: Zone[];
  counts: Record<string, number>;
  amounts: Record<string, number | null>;
  /**
   * 구역은 알지만 이 일정은 포털에 물을 길이 없다(예: 1박 달력만 공개된 곳의 2박).
   * 그 날짜는 없음이 아니라 모름이다. 구역 목록은 그대로 써서 행은 남긴다.
   */
  unanswered?: boolean;
};

export type Room = {
  no: string;
  zoneNo: string;
  name: string;
  /** 포털이 요금을 한 번도 보여주지 않은 객실은 null 이다(국립공원: 기간 내내 예약이 끝난 영지). */
  amount: number | null;
  size: string;
};

export type RoomDay = {
  rooms: Room[];
  available: string[];
};

/** 예약 페이지로 넘기는 폼. 일정을 POST 로만 받는 포털이 있어 링크가 아니라 폼이다. */
export type BookingTarget = {
  url: string;
  method: "GET" | "POST";
  fields: Record<string, string>;
};

export interface CampProvider {
  id: ProviderId;
  /**
   * 예약 기간을 가볍게 물을 수 있는가. 아니면 캠핑장 목록을 열 때 묻지 않고, 캠핑장을
   * 켰을 때 스캔이 받아 온다(국립공원은 기간을 알려면 5MB 표를 받아야 한다).
   */
  cheapWindow: boolean;
  listCamps(portal: Portal): Promise<CampRef[]>;
  bookingWindow(portal: Portal, camp: CampRef): Promise<BookingWindow | null>;
  zoneDay(
    portal: Portal,
    camp: CampRef,
    date: string,
    nights: number,
  ): Promise<ZoneDay | null>;
  roomDay(
    portal: Portal,
    camp: CampRef,
    zoneNo: string,
    date: string,
    nights: number,
  ): Promise<RoomDay | null>;
  bookingTarget(
    portal: Portal,
    camp: CampRef,
    checkIn: string,
    nights: number,
  ): BookingTarget;
}
