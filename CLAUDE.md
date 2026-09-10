# 빈자리

예약 사이트를 훑어 지금 비어 있는 것을 한 화면에 보여준다. Next.js 16 (App Router,
Turbopack) · React 19 · Tailwind v4 · zustand · TanStack Query. 패키지 매니저는 pnpm.

```bash
pnpm dev        # http://localhost:3000
pnpm test       # vitest
pnpm typecheck
pnpm lint
```

코드를 고치기 전에 읽을 것:

- [README.md](README.md) — 무엇을 왜 만드는가, 모듈 구조, 캠핑장·포털 추가법
- [DESIGN.md](DESIGN.md) — 디자인 시스템. 1부는 룩앤필(색·타입·형태·밀도·모션),
  2부는 보이스앤톤(말투·표기·상황별 문구)이다. 토큰은 여기서 정한 것만 쓰고
  임의값(`text-[11.5px]` 등)은 쓰지 않는다. 화면에 나가는 모든 문장은 해요체다.

두 문서는 결정과 그 이유를 담는다. 결정을 바꾸면 문서도 같이 고친다.

@AGENTS.md
