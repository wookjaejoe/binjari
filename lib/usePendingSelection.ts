"use client";

import { useEffect } from "react";

import type { CampData } from "@/lib/availability";
import { COMPACT_ZONE_MAX } from "@/lib/policy";
import { useSelection } from "@/store/selection";

/**
 * 구역 목록은 스캔이 끝난 뒤에야 알 수 있으므로, "이 캠핑장을 켜 달라"는 요청은
 * 대기 목록에 쌓아 두고 목록이 도착하면 여기서 실제 선택으로 바꾼다.
 * 대상 선택 시트가 닫혀 있어도 돌아야 하므로 화면이 아니라 페이지에서 호출한다.
 */
export function usePendingSelection(data: CampData[]) {
  const pendingAll = useSelection((state) => state.pendingAll);
  const resolvePendingAll = useSelection((state) => state.resolvePendingAll);

  useEffect(() => {
    for (const { campId, scope } of pendingAll) {
      const zones = data.find((entry) => entry.camp.id === campId)?.zoneScan?.zones;
      if (!zones?.length) continue;
      const compact = zones.filter((zone) => zone.total <= COMPACT_ZONE_MAX);
      const picked = scope === "compact" && compact.length ? compact : zones;
      resolvePendingAll(
        campId,
        picked.map((zone) => zone.no),
      );
    }
  }, [pendingAll, data, resolvePendingAll]);
}
