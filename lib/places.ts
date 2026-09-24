import raw from "@/lib/places.json";

/**
 * 캠핑장 좌표·지역. scripts/build-places.ts 가 고캠핑·OpenStreetMap 에서 모아 places.json 에
 * 쓴다. 포털은 좌표를 주지 않는다. 좌표가 없는 캠핑장(새로 생겼거나 못 찾은 곳)도 목록에는
 * 나온다 — "지역 미확인" 묶음으로.
 */
export type Place = {
  lat: number;
  lng: number;
  address: string;
  /** "강원" 같은 짧은 시도 이름 */
  sido: string;
  zones?: Record<string, { lat: number; lng: number }>;
};

const PLACES = raw as Record<string, Place>;

export const placeOf = (campId: string): Place | undefined => PLACES[campId];

/** 지역 묶음 순서. 북에서 남으로, 수도권 → 강원 → 충청 → 경상 → 전라 → 제주. */
export const SIDO_ORDER = [
  "서울", "인천", "경기", "강원", "충북", "세종", "대전", "충남",
  "경북", "대구", "울산", "부산", "경남", "전북", "광주", "전남", "제주",
];

export const UNKNOWN_SIDO = "지역 미확인";

export const sidoOf = (campId: string) => placeOf(campId)?.sido || UNKNOWN_SIDO;

export const sidoRank = (sido: string) => {
  const index = SIDO_ORDER.indexOf(sido);
  return index < 0 ? SIDO_ORDER.length : index;
};
