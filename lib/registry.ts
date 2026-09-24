import { knps } from "@/lib/providers/knps";
import { pubcamping } from "@/lib/providers/pubcamping";
import type { CampProvider, CampRef, Portal, ProviderId } from "@/lib/providers/types";

/**
 * 예약 포털 등록부. 포털마다 예약 시스템이 달라 어댑터(provider)가 따로 있다.
 * 개별 캠핑장은 포털에서 자동으로 발견하므로 따로 적지 않는다.
 */
export const PORTALS: Portal[] = [
  {
    id: "gwgs",
    host: "gwgs.pubcamping.kr",
    label: "고성군",
    provider: "pubcamping",
  },
  {
    id: "knps",
    host: "reservation.knps.or.kr",
    label: "국립공원",
    provider: "knps",
  },
];

const PROVIDERS: Record<ProviderId, CampProvider> = {
  pubcamping,
  knps,
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
