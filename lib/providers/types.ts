export type ProviderId = "pubcamping";

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
};

export type Room = {
  no: string;
  zoneNo: string;
  name: string;
  amount: number;
  size: string;
};

export type RoomDay = {
  rooms: Room[];
  available: string[];
};

export type BookingTarget = {
  url: string;
  method: "POST";
  fields: Record<string, string>;
};

export interface CampProvider {
  id: ProviderId;
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
