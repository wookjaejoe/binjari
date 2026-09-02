import type { CampProfile, ZoneScan } from "@/lib/types";
import type { ZoneSelection } from "@/store/selection";

export type Selection = Record<string, Record<string, ZoneSelection>>;

/**
 * reconcileSelection에 넘길 "지금 조회 가능한 것" 지도를 만든다.
 *
 * 핵심은 **조회 실패를 운영 중단으로 오판하지 않는 것**이다. 캠핑장 상태가
 * unknown이면(프로필 조회가 실패했다는 뜻) 판단을 보류해야 한다. 그러지 않으면
 * 네트워크가 한 번 흔들린 사이에 사용자가 고른 캠핑장이 조용히 사라진다.
 */
export function buildValidMap(
  camps: CampProfile[],
  zoneScans: Map<string, ZoneScan>,
): Record<string, string[] | "unknown"> {
  const valid: Record<string, string[] | "unknown"> = {};

  for (const camp of camps) {
    if (camp.status === "unknown") {
      valid[camp.id] = "unknown";
      continue;
    }
    // preparing·unopened는 확정된 판정이므로 지도에서 빼 선택을 정리한다.
    if (camp.status !== "open") continue;

    const scan = zoneScans.get(camp.id);
    valid[camp.id] = scan ? scan.zones.map((zone) => zone.no) : "unknown";
  }

  return valid;
}

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
