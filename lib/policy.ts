import type { Zone } from "@/lib/types";

/**
 * 운영자가 시스템 점검용으로 등록해 둔 구역. 실제 예약 대상이 아니다.
 * 고성군 대진1리가 "결제테스트" 구역 하나만 열어둔 상태로 목록에 나온다.
 */
const TEST_ZONE = /테스트|test/i;

export function isBookableZone(zone: Zone): boolean {
  return !TEST_ZONE.test(zone.name);
}

/**
 * 처음 방문 시 켜 둘 구역의 크기 상한. 이보다 큰 대규모 사이트는
 * 상시 여유가 있어 "빈자리 찾기"의 신호를 덮는다. 좁게 시작하고
 * 필요하면 사용자가 트리에서 직접 켜는 편이 낫다.
 */
export const COMPACT_ZONE_MAX = 12;

/** 농도 4단 + 마감(0). FILL 배열의 인덱스로 그대로 쓴다. */
export type FillLevel = 0 | 1 | 2 | 3 | 4;

/**
 * 농도 스케일. 고정 구간이 아니라 지금 화면에 있는 값들의 분포로 나눈다.
 *
 * 고정 비율 구간(0.75 이상이면 4단 …)은 값이 한쪽에 몰리는 순간 무너진다.
 * "열린 구역 수 / 활성 구역 수"에 그 구간을 쓰던 때 실측으로 52칸 중 43칸이
 * 4단에 몰려 격자가 균일한 회색이 됐다. 구역이 6개면 나올 수 있는 비율이
 * 1/6..6/6뿐이라 1단(0.15 미만)은 도달조차 못 한다 — 구간을 조정해도
 * 선택한 구역 수가 바뀌면 다시 어긋난다.
 *
 * 참고 모델인 Google Flights의 Date Grid도 절대 금액이 아니라 조회 결과
 * 안에서의 상대 위치로 색을 정한다. 여기서 비교의 단위는 "지금 보고 있는 기간"이다.
 * 소스가 늘어 값의 범위가 달라져도 스케일이 따라온다.
 *
 * 빈도가 아니라 값의 종류 위에서 순위를 매긴다. 같은 값이 아무리 반복돼도
 * 나머지 값들이 한쪽으로 눌리지 않는다. 가장 큰 값은 항상 4단, 가장 작은
 * 값은 항상 1단이 된다.
 */
export function fillScale(values: number[]): (value: number) => FillLevel {
  const distinct = [...new Set(values.filter((v) => v > 0))].sort((a, b) => a - b);
  const span = distinct.length - 1;

  return (value) => {
    if (value <= 0) return 0;
    // 값이 한 종류뿐이면 나눌 것이 없다. 비교가 불가능하다고 흐리게 두는 것보다
    // "여기 자리가 있다"를 또렷하게 두는 편이 이 화면의 몫에 맞다.
    if (span <= 0) return 4;
    let rank = 0;
    while (rank < span && distinct[rank + 1] <= value) rank++;
    return (1 + Math.round((rank / span) * 3)) as FillLevel;
  };
}
