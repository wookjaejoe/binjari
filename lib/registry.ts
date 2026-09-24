import { asanfmc } from "@/lib/providers/asanfmc";
import { dpto } from "@/lib/providers/dpto";
import { gmuc } from "@/lib/providers/gmuc";
import { gtdc } from "@/lib/providers/gtdc";
import { huyang } from "@/lib/providers/huyang";
import { knps } from "@/lib/providers/knps";
import { knpsShelter } from "@/lib/providers/knps-shelter";
import { maketicket } from "@/lib/providers/maketicket";
import { moonhwain } from "@/lib/providers/moonhwain";
import { pubcamping } from "@/lib/providers/pubcamping";
import { rsvasp } from "@/lib/providers/rsvasp";
import { suseong } from "@/lib/providers/suseong";
import { ulju } from "@/lib/providers/ulju";
import { xticket } from "@/lib/providers/xticket";
import { yesan } from "@/lib/providers/yesan";
import type { CampProvider, CampRef, Portal, ProviderId } from "@/lib/providers/types";

/**
 * 예약 포털 등록부. 포털마다 예약 시스템이 달라 어댑터(provider)가 따로 있다.
 * 개별 캠핑장은 포털에서 자동으로 발견하므로 따로 적지 않는다.
 */
export const PORTALS: Portal[] = [
  {
    id: "gwgs",
    host: "gwgs.pubcamping.kr",
    // 대상 시트의 둘째 줄에 적는 종류다. 위치는 지역 묶음(강원)이 말한다.
    label: "지자체 캠핑장",
    provider: "pubcamping",
  },
  {
    id: "knps",
    host: "reservation.knps.or.kr",
    label: "국립공원 야영장",
    provider: "knps",
  },
  {
    id: "knps-shelter",
    host: "reservation.knps.or.kr",
    label: "국립공원 대피소",
    provider: "knpsShelter",
  },
  {
    id: "xticket",
    host: "camp.xticket.kr",
    label: "지자체 캠핑장",
    provider: "xticket",
  },
  {
    id: "moonhwain",
    host: "moonhwain.net",
    label: "지자체 캠핑장",
    provider: "moonhwain",
  },
  {
    id: "yesan",
    host: "camping.yesan.go.kr",
    label: "지자체 캠핑장",
    provider: "yesan",
  },
  {
    // 캠핑장마다 도메인이 다르다. 주소는 어댑터의 목록(RSVASP_CAMPS)에 있다.
    id: "rsvasp",
    host: "",
    label: "지자체 캠핑장",
    provider: "rsvasp",
  },
  {
    id: "gmuc",
    host: "www.gmuc.co.kr",
    label: "지자체 캠핑장",
    provider: "gmuc",
  },
  {
    id: "maketicket",
    host: "forest.maketicket.co.kr",
    label: "지자체 캠핑장",
    provider: "maketicket",
  },
  {
    id: "gtdc",
    host: "camping.gtdc.or.kr",
    label: "지자체 캠핑장",
    provider: "gtdc",
  },
  {
    id: "suseong",
    host: "www.suseong.kr",
    label: "지자체 캠핑장",
    provider: "suseong",
  },
  {
    id: "asanfmc",
    host: "camping.asanfmc.or.kr",
    label: "지자체 캠핑장",
    provider: "asanfmc",
  },
  {
    // 캠핑장마다 서브도메인이 다르다. 주소는 어댑터의 목록(HUYANG_CAMPS)에 있다.
    id: "huyang",
    host: "",
    label: "지자체 캠핑장",
    provider: "huyang",
  },
  {
    id: "ulju",
    host: "camping.ulju.ulsan.kr",
    label: "지자체 캠핑장",
    provider: "ulju",
  },
  {
    id: "dpto",
    host: "camping.dpto.or.kr",
    label: "지자체 캠핑장",
    provider: "dpto",
  },
];

const PROVIDERS: Record<ProviderId, CampProvider> = {
  pubcamping,
  knps,
  knpsShelter,
  xticket,
  moonhwain,
  yesan,
  rsvasp,
  gmuc,
  maketicket,
  gtdc,
  suseong,
  asanfmc,
  huyang,
  ulju,
  dpto,
};

/** 자동 발견 목록에서 뺄 캠핑장, 또는 표시 이름을 다듬을 곳. */
export const CAMP_OVERRIDES: Record<string, { name?: string; hidden?: boolean }> = {
  "gwgs:song": { name: "송지호오토캠핑장" },
};

export function getPortal(portalId: string): Portal {
  const portal = PORTALS.find((p) => p.id === portalId);
  if (!portal) throw new Error(`등록되지 않은 포털: ${portalId}`);
  return portal;
}

export function getProvider(portal: Portal): CampProvider {
  return PROVIDERS[portal.provider];
}

/** 포털 하나가 목록을 못 주면 그 포털만 빠진다. 다른 포털의 캠핑장까지 막지 않는다. */
export async function listAllCamps(): Promise<CampRef[]> {
  const groups = await Promise.allSettled(
    PORTALS.map(async (portal) => {
      const camps = await getProvider(portal).listCamps(portal);
      return camps
        .map((camp) => ({ ...camp, ...CAMP_OVERRIDES[camp.id] }))
        .filter((camp) => !CAMP_OVERRIDES[camp.id]?.hidden);
    }),
  );
  const found = groups.flatMap((group) => (group.status === "fulfilled" ? group.value : []));
  const failed = groups.find((group) => group.status === "rejected");
  if (!found.length && failed) throw failed.reason;
  return found;
}

export async function resolveCamp(campId: string) {
  const camps = await listAllCamps();
  const camp = camps.find((c) => c.id === campId);
  if (!camp) throw new Error(`알 수 없는 캠핑장: ${campId}`);
  const portal = getPortal(camp.portalId);
  return { camp, portal, provider: getProvider(portal) };
}
