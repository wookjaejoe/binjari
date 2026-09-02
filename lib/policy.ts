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

/** 가용 비율을 농도 4단계로. 0은 마감. */
export function fillLevel(count: number, capacity: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (capacity <= 1) return 4;
  const ratio = count / capacity;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.4) return 3;
  if (ratio >= 0.15) return 2;
  return 1;
}
