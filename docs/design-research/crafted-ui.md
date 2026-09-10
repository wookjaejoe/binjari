# 조사 3: crafted UI 레퍼런스 (요약 — 결정에 쓸 것만)

## verified 토큰 값
- Polaris: space 0/1/2/4/6/8/12/16/20/24/32/40/48/64; radius 0/2/4/6/8/12/16/20/30/full; border 0.66/1/2/4;
  Inter weight 450/550/650/700(기본보다 반단계 무겁게); size 11/12/13/14/16/18/20/22/24/30/32; lh 12/16/20/24/28/32;
  letter-spacing densest -0.54px, denser -0.3, dense -0.2; motion 50~500ms step 50; ease-out cubic-bezier(0.19,0.91,0.38,1);
  shadow-100 `0 1px 0 rgba(26,26,26,.07)`, shadow-300 `0 4px 6px -2px rgba(26,26,26,.2)`, border-inset `0 0 0 1px rgba(0,0,0,.08) inset`. 그림자 색 #1a1a1a 베이스(순흑 X).
- Material 3: shape 4/8/12/16/28/full; duration short 50-200, medium 250-400, long 450-600; standard ease (0.2,0,0,1), decelerate (0,0,0,1), emphasized-decel (0.05,0.7,0.1,1).
- Linear: Inter Display 헤딩 + Inter 본문; LCH 기반, base/accent/contrast 3변수로 테마; chrome(파랑) 사용 제한 → 시대 안 타는 쿨 그레이.
- Duolingo: Feather Bold(소문자 헤드라인) + DIN Next Rounded 본문, 한 문장에 섞지 않음; 텍스트 Eel #4B4B4B(순흑 X); "When in doubt, lean in to green"; 2026 리디자인: 강제 컨테이너 제거, 여백으로 구조화.
- Spotify: 서드파티 fallback bg #191414; 브랜드 팔레트 밖 색 금지.
- Vercel Web Interface Guidelines: `…` 사용, 곡선 따옴표, nbsp(`10 MB`), tabular-nums, text-wrap:balance, transition:all 금지, transform/opacity만, URL이 상태 반영, 에러에 다음 단계, 구체적 버튼 라벨, 입력 16px+.
- Rauno: 인터랙션 ≤200ms, 빈번 액션은 무애니메이션, weight 400 미만 금지, hover에서 weight 변경 금지, 포커스링은 box-shadow, 터치에 hover 노출 금지, 빈 상태는 생성 유도.
- Emil: <300ms, ease-out 기본(내장 커브는 약함, 커스텀), 키보드 발동 액션 무애니메이션, 드롭다운은 트리거 origin, 기능 그래프는 무애니메이션.
- Hobday: near-black/near-white; neutral 채도는 warm/cool 하나만; 큰 글자 자간·행간 축소, 작은 글자 확대; 컨테이너-배경 명도차 ≤7%(라이트) ≤12%(다크); 그림자 blur = 거리 2배; 바깥 패딩 ≥ 안쪽; 버튼 가로 패딩 = 세로 2배; 서체 ≤2; 동심 코너; 하드 구분선 연속 금지; 다크 UI 그림자 금지; 깊이 기법 혼용 금지; 텍스트 옆 아이콘 대비 낮춤.
- Refactoring UI: 보더 줄이기, 크기 대신 색·weight로 계층, 유색 배경 위 회색 텍스트 금지, 강조하려면 주변을 약하게, 라벨은 최후 수단, 회색에 온도, 그림자 2파트.
- Erik Kennedy: 빛은 위에서, 흑백 먼저 액센트 하나, 여백 2배, 큰+가벼움 / 굵+소문자 같은 상반 조합.

## (a) crafted 공통 원칙
1 서체는 결정의 결과(역할 분리, 한 문장에 안 섞음) 2 순흑·순백 없음, 한 온도 3 액센트 하나 소량, 제품 UI에 그라데이션 없음 4 표면은 hairline 또는 fill, 그림자 낮고 드물게 5 radius 소수 단계 + 동심 6 4px 스케일, 리스트>카드 7 tabular 숫자 8 모션 짧고 ease-out, bounce 없음 9 빈/긴/에러 상태 설계 10 광학 정렬·nbsp·곡선 따옴표 11 카피 짧고 구체, 능동, 느낌표 드묾 12 URL·키보드·접근성.

## (b) AI/템플릿 tell (2곳 이상 반복)
indigo/violet #6366f1 계열·purple→cyan 그라데이션 / Inter·Geist·Roboto 단독 기본 자간 / 아이콘+제목+2줄 동일 카드 3개·벤토 / 모든 요소 균일 8–16px radius·버튼 전부 pill / 모든 카드 소프트 섀도 → 계층 없음 / 헤딩·카드 이모지 / 글래스+네온 glow+반사적 다크모드 / hover마다 scale·bounce, fade-up / 그라데이션 텍스트·블롭 / "Transform/Supercharge" 헤드라인, **em-dash 과용** / 카드 속 카드·아이브로 라벨·펄스 점 / 불규칙 패딩·평평한 타입 계층 / (Impeccable) 기능 텍스트 과소 사이즈, "theater framing" 카피(설명 과잉), 크림·베이지 팔레트, 손대지 않은 shadcn 기본.
- 925studios: "distinctiveness comes from making the decision rather than inheriting it."

## 빈자리 현재 상태에 직접 걸리는 tell
- Geist+Pretendard = 안전한 기본값, 자간 결정 없음
- 조건 버튼·칩 전부 pill, 세그먼트·카드·셀은 6/8/12 → radius 위계 없음
- UI 캡션에 em-dash("— 진할수록…") + 설명 과잉 캡션
- 액센트 0개 = 결정 회피(Linear식 무채색은 dev tool 맥락에서만 성립)
- 임의값 24개, 칩 3종, 불규칙 들여쓰기 = "디테일 미검수" tell
