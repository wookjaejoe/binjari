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
  minStay: number;
  maxStay: number;
};

export type Zone = {
  no: string;
  name: string;
  total: number;
  size: string;
  maxPeop: number;
  order: number;
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
