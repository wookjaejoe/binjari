import { NextResponse } from "next/server";

import { listAllCamps } from "@/lib/registry";
import { campProfile } from "@/lib/scan";
import type { CampProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

const ORDER: Record<CampProfile["status"], number> = {
  open: 0,
  unknown: 1,
  preparing: 2,
  unopened: 3,
};

export async function GET() {
  try {
    const camps = await listAllCamps();
    const profiles = await Promise.all(
      camps.map(async (camp): Promise<CampProfile> => {
        try {
          return await campProfile(camp.id);
        } catch {
          return {
            id: camp.id,
            name: camp.name,
            portalId: camp.portalId,
            portalLabel: "",
            window: null,
            status: "unknown",
            zoneCount: 0,
            roomCount: 0,
          };
        }
      }),
    );
    profiles.sort(
      (a, b) => ORDER[a.status] - ORDER[b.status] || b.roomCount - a.roomCount,
    );
    return NextResponse.json({ camps: profiles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "캠핑장 목록 조회 실패" },
      { status: 502 },
    );
  }
}
