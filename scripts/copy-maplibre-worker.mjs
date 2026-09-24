/**
 * maplibre-gl 의 웹 워커를 public/maplibre 로 복사한다. `pnpm install` 뒤에 돈다(postinstall).
 *
 * maplibre-gl v6 는 워커를 `import.meta.url` 기준 상대 경로로 찾는다. 번들러가 라이브러리를
 * 청크로 옮기면 그 경로가 깨져서, 워커 파일을 정적 파일로 두고 `setWorkerUrl` 로 가리킨다.
 * 버전이 바뀌어도 설치할 때마다 다시 복사하니 어긋나지 않는다. 복사본은 커밋하지 않는다.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const dist = dirname(createRequire(import.meta.url).resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const out = join(import.meta.dirname, "..", "public", "maplibre");
mkdirSync(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, file), join(out, file));
}
