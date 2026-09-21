import { NextResponse } from "next/server";

import { dropScanCache, scanZones } from "@/lib/scan";

export const dynamic = "force-dynamic";
// 스캔은 날짜 수만큼 포털을 부른다. 서버리스 기본 한도(10초)로는 콜드 스타트 때 모자란다.
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const campId = params.get("camp");
  if (!campId) {
    return NextResponse.json({ error: "camp 파라미터가 필요합니다" }, { status: 400 });
  }
  const nights = Math.max(1, Math.min(14, Number(params.get("nights") ?? 1) || 1));

  try {
    if (params.get("fresh")) dropScanCache(campId);
    return NextResponse.json(await scanZones(campId, nights));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 },
    );
  }
}
