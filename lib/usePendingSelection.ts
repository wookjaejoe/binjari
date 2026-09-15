"use client";

import { useEffect } from "react";

import type { CampData } from "@/lib/availability";
import { useSelection } from "@/store/selection";

/**
 * 구역 목록은 스캔이 끝난 뒤에야 알 수 있으므로, "이 캠핑장을 켜 달라"는 요청은
 * 대기 목록에 쌓아 두고 목록이 도착하면 여기서 실제 선택으로 바꾼다.
 * 대상 선택 시트가 닫혀 있어도 돌아야 하므로 화면이 아니라 페이지에서 호출한다.
 * 구역이 비어 오면 스토어가 대기를 유지한다 — 다음 스캔에서 다시 시도된다.
 */
export function usePendingSelection(data: CampData[]) {
  const pendingAll = useSelection((state) => state.pendingAll);
  const resolvePendingAll = useSelection((state) => state.resolvePendingAll);

  useEffect(() => {
    for (const campId of pendingAll) {
      const zones = data.find((item) => item.camp.id === campId)?.zoneScan?.zones;
      if (!zones?.length) continue;
      resolvePendingAll(
        campId,
        zones.map((zone) => zone.no),
      );
    }
  }, [pendingAll, data, resolvePendingAll]);
}
