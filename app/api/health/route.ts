import { NextResponse } from "next/server";

import { checkCamp, listPortals } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 포털 점검(scripts/check-portals.ts 가 부른다). camp 없이 부르면 포털별 캠핑장 목록,
 * camp 를 주면 그 캠핑장 하나를 점검한다. 결과는 캠핑장마다 10분 캐시한다 — 이 주소를
 * 누가 거듭 불러도 포털에는 10분에 한 번만 간다.
 */
export async function GET(request: Request) {
  const campId = new URL(request.url).searchParams.get("camp");
  if (!campId) return NextResponse.json({ portals: await listPortals() });
  return NextResponse.json(await checkCamp(campId));
}
