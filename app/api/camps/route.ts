import { NextResponse } from "next/server";

import { getPortal, listAllCamps } from "@/lib/registry";
import { campProfile } from "@/lib/scan";
import type { CampProfile } from "@/lib/types";

export const dynamic = "force-dynamic";
// 스캔은 날짜 수만큼 포털을 부른다. 서버리스 기본 한도(10초)로는 콜드 스타트 때 모자란다.
export const maxDuration = 60;

/** 포털 목록 순서 그대로 돌려준다. 앱이 상태를 매겨 줄을 세우지 않는다. */
export async function GET() {
  try {
    const camps = await listAllCamps();
    const profiles = await Promise.all(
      camps.map(async (camp): Promise<CampProfile> => {
        try {
          return await campProfile(camp.id);
        } catch (error) {
          return {
            id: camp.id,
            name: camp.name,
            portalId: camp.portalId,
            portalLabel: getPortal(camp.portalId).label,
            window: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    return NextResponse.json({ camps: profiles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "캠핑장 목록 조회 실패" },
      { status: 502 },
    );
  }
}
