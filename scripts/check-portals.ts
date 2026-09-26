/**
 * 포털 점검. 앱의 /api/health 를 캠핑장마다 불러 결과를 모은다. 포털 요청은 앱 서버에서
 * 나가므로, 배포 주소를 주면 실제 배포 환경(Vercel 서울 리전의 IP·포트)에서 되는지를 본다.
 *
 *   pnpm dev
 *   node scripts/check-portals.ts                        # http://localhost:3000
 *   APP=https://binjari-xi.vercel.app node scripts/check-portals.ts --md report.md
 *
 * 실패(fail)가 하나라도 있거나 포털이 목록을 못 주면 종료 코드 1. 경고(warn)는 적기만 한다.
 * GitHub Actions(.github/workflows/portal-health.yml)가 매일 운영 주소로 돌리고 이슈로 알린다.
 *
 * 국립공원은 캠핑장마다 3.5MB 표를 받는다. 한 어댑터가 48곳을 같은 방식으로 읽으니 날마다
 * 돌아가며 몇 곳만 본다(ROTATE). 나머지 포털은 캠핑장마다 주소·설정이 달라 전부 본다.
 */
import { writeFileSync } from "node:fs";

type Health = {
  id: string;
  name: string;
  portalId: string;
  status: "ok" | "warn" | "fail";
  problems: string[];
  sample: Record<string, number>;
  zones: string[];
  ms: number;
};
type Listing = { id: string; label: string; camps: { id: string; name: string }[]; error?: string };

const APP = (process.env.APP ?? "http://localhost:3000").replace(/\/$/, "");
const mdAt = process.argv.indexOf("--md");
const MD = mdAt > 0 ? process.argv[mdAt + 1] : null;
const ROTATE: Record<string, number> = { knps: 3, "knps-shelter": 2 };
const PARALLEL_PORTALS = 4;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${APP}${path}`, { signal: AbortSignal.timeout(90_000) });
  const body = await res.text();
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status} ${body.slice(0, 120)}`);
  return JSON.parse(body) as T;
}

/** 날마다 다른 몇 곳. 한 달이면 국립공원 전부를 한 번 이상 본다. */
function pick<T>(camps: T[], portalId: string): T[] {
  const n = ROTATE[portalId];
  if (!n || camps.length <= n) return camps;
  const day = Math.floor(Date.now() / 86_400_000);
  return Array.from({ length: n }, (_, i) => camps[(day * n + i) % camps.length]);
}

async function checkPortal(portal: Listing): Promise<Health[]> {
  const results: Health[] = [];
  // 한 포털 안에서는 차례로 — 같은 호스트에 점검 요청을 겹쳐 보내지 않는다.
  for (const camp of pick(portal.camps, portal.id)) {
    try {
      results.push(await get<Health>(`/api/health?camp=${encodeURIComponent(camp.id)}`));
    } catch (error) {
      results.push({
        id: camp.id,
        name: camp.name,
        portalId: portal.id,
        status: "fail",
        problems: [error instanceof Error ? error.message : String(error)],
        sample: {},
        zones: [],
        ms: 0,
      });
    }
  }
  return results;
}

const started = Date.now();
const { portals } = await get<{ portals: Listing[] }>("/api/health");
const queue = [...portals.filter((portal) => !portal.error)];
const results: Health[] = [];
await Promise.all(
  Array.from({ length: PARALLEL_PORTALS }, async () => {
    for (let portal = queue.shift(); portal; portal = queue.shift()) results.push(...(await checkPortal(portal)));
  }),
);

const listFailures = portals.filter((portal) => portal.error);
const failed = results.filter((r) => r.status === "fail");
const warned = results.filter((r) => r.status === "warn");
const line = (r: Health) => `- ${r.name} (\`${r.id}\`): ${r.problems.join(" / ")}`;

const lines = [
  `포털 점검 ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${APP}`,
  `캠핑장 ${results.length}곳 — 통과 ${results.length - failed.length - warned.length}, 경고 ${warned.length}, 실패 ${failed.length}` +
    (listFailures.length ? `, 목록 실패 포털 ${listFailures.length}` : "") +
    ` · ${Math.round((Date.now() - started) / 1000)}초`,
  "",
  ...(listFailures.length ? ["### 목록을 못 준 포털", ...listFailures.map((p) => `- ${p.id}: ${p.error}`), ""] : []),
  ...(failed.length ? ["### 실패", ...failed.map(line), ""] : []),
  ...(warned.length ? ["### 경고", ...warned.map(line), ""] : []),
  // 같은 실패가 이어지면 이슈에 다시 적지 않으려고 둔다(워크플로가 읽는다).
  `<!-- fails: ${[...listFailures.map((p) => p.id), ...failed.map((r) => r.id)].sort().join(",")} -->`,
];
console.log(lines.join("\n"));
if (MD) writeFileSync(MD, lines.join("\n") + "\n");
process.exit(failed.length || listFailures.length ? 1 : 0);
