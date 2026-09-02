import { NextResponse } from "next/server";

import { resolveCamp } from "@/lib/registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const campId = params.get("camp");
  const date = params.get("date");
  if (!campId || !date) {
    return NextResponse.json(
      { error: "camp, date 파라미터가 필요합니다" },
      { status: 400 },
    );
  }
  const nights = Math.max(1, Math.min(14, Number(params.get("nights") ?? 1) || 1));

  try {
    const { camp, portal, provider } = await resolveCamp(campId);
    return NextResponse.json(provider.bookingTarget(portal, camp, date, nights));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "예약 링크 생성 실패" },
      { status: 502 },
    );
  }
}
