import { NextResponse } from "next/server";

import { scanRooms } from "@/lib/scan";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const campId = params.get("camp");
  if (!campId) {
    return NextResponse.json({ error: "camp 파라미터가 필요합니다" }, { status: 400 });
  }
  const nights = Math.max(1, Math.min(14, Number(params.get("nights") ?? 1) || 1));
  const zones = (params.get("zones") ?? "")
    .split(",")
    .map((z) => z.trim())
    .filter(Boolean);

  try {
    return NextResponse.json(await scanRooms(campId, nights, zones));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 },
    );
  }
}
