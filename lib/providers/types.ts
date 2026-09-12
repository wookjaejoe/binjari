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

export type BookingWindow = {
  start: string;
  end: string;
  /** 이 캠핑장이 받는 최대 연박. 이보다 긴 숙박을 고르면 그 캠핑장을 조회에서 뺀다. */
  maxStay: number;
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
