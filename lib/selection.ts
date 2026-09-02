import type { ZoneSelection } from "@/store/selection";

export type Selection = Record<string, Record<string, ZoneSelection>>;

/**
 * 저장된 선택을 지금 조회 가능한 것만 남기고 정리한다.
 *
 * `valid`에 없는 캠핑장은 사라졌거나 운영이 멈춘 곳이므로 버린다.
 * `"unknown"`은 구역 목록이 아직 도착하지 않은 것이니 손대지 않는다.
 *
 * 변경이 없으면 `null`을 돌려준다 — 호출자가 상태를 갱신하지 않아야
 * 렌더 루프가 생기지 않는다.
 */
export function reconcileSelection(
  current: Selection,
  valid: Record<string, string[] | "unknown">,
): Selection | null {
  let changed = false;
  const next: Selection = {};

  for (const [campId, zones] of Object.entries(current)) {
    const allowed = valid[campId];

    if (allowed === undefined) {
      changed = true;
      continue;
    }
    if (allowed === "unknown") {
      next[campId] = zones;
      continue;
    }

    const kept: Record<string, ZoneSelection> = {};
    for (const [zoneNo, pick] of Object.entries(zones)) {
      if (allowed.includes(zoneNo)) kept[zoneNo] = pick;
      else changed = true;
    }

    if (Object.keys(kept).length) next[campId] = kept;
    else changed = true;
  }

  return changed ? next : null;
}
