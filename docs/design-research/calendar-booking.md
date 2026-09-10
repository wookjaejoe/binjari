# 조사 2: 캘린더·예약 (요약 — 결정에 쓸 것만)

## Cal.com (소스코드 1차, 가장 유용)
- 서체: Inter 본문 + Cal Sans SemiBold **디스플레이 전용**. "Cal Sans is a display font, meaning that it should exclusively be used for headings and large text."
- 브랜드: `--cal-brand: hsla(221,39%,11%)` = 거의 검정. 다크에서 흰색으로 반전. "grayscale brand to emphasise on boldness and professionalism."
- **날짜 셀 상태 (핵심 참고)**:
  - 가용일 `bg-emphasis` + `text-emphasis` (연회색 채움 + 진한 글자 + medium)
  - 불가일 채움 없음 + `text-mute` + `font-light` + cursor default
  - 선택일 `bg-brand-default text-brand` (검정 채움)
  - 오늘 = 숫자 아래 5px 점
  → **"가용 = 채워짐 / 불가 = 배경 없는 흐린 숫자"** 대비 구조. 우리 히트맵과 같은 문법.
- 잔여율 3단 점: `≥83% bg-rose-600 / ≥50% bg-yellow-500 / else bg-emerald-400`
- radius 2/4/6/8/12/16/24. 부커는 1px 보더 분할, 그림자는 드롭다운에만.
- 현재 달 전부 불가 → **다음 달 자동 이동**.
- 마이크로카피(EN/KO 공식): `All booked.`/`모두 예약됨.`, `No availability in {{month}}`/`{{month}}에 이용 불가`, `Taken`/`예약됨`, `Not available`/`사용할 수 없음`, `Confirm`/`확인`.
  → KO 번역이 "이용 불가/사용 불가/사용할 수 없음"으로 흔들림 = 상태어를 고정하지 않으면 이렇게 된다.

## Skyscanner Backpack (토큰 1차)
- **날짜 셀 36px 원형**, 간격 8px, 선택 = accent 채움 + 반전, 범위 중간 = surface-subtle, 포커스 2px inset 링.
- 셀 구조 = 날짜(label1) + **아래 캡션에 가격**. 숫자 없는 날엔 아이콘/로딩 슬롯.
- 코드에 CellStatus Positive/Neutral/Negative/Empty 4단이 있으나 **실제 매핑은 Positive만 success색, 나머지는 textSecondary**. → 다단 서열 채색은 업계 표준 아님.

## Notion Calendar (Cron)
- 앱은 **시스템 서체**(SF Pro/SF Compact), Inter 아님. 이벤트 칩 제목 11px / 시간 9px.
- radius 2/4/8/12. 액센트 오렌지. "intentionally neutral interface makes the calendar content and fiery orange accents really pop."
- 다크는 나중에 추가(라이트 퍼스트). 커스텀 색 균일화에 CIECAM02.
- 키보드 퍼스트: `?` 치트시트, `⌘K`, `S` 가용성 공유, `Z` 타임존, `M/W/D` 뷰.
- "Good design isn't just how it looks but how it works and how it's built."

## Google Calendar (M3 Expressive)
- Google Sans Flex 가변 6축. M3: "larger sizes, heavier weights, and improved hierarchy".
- 월 뷰 날짜를 컨테이너로 분리 + 라운드 → 9to5Google 평: "looks more modern, but **it feels heavier to browse**." ← 셀을 카드화하면 훑기가 무거워진다는 실사용 지적.
- M3 shape 4/8/12/16/28. duration short 50-200 / medium 250-400. 스프링 기반 전환.

## Apple Calendar
- SF Pro. **시간 표기용 콜론이 수직 중앙 정렬 형태로 바뀜**(San Francisco 기능).
- 월 뷰 4모드 핀치 연속 전환: Compact(점) → Stacked(pill) → Details(제목) → List.
- Liquid Glass는 **네비게이션 레이어 전용**, "Don't use Liquid Glass in the content layer", "always avoid glass on glass". 동심 코너 유지.

## Structured
- 핵심 = 세로 타임라인 하나. "Most planners give you a blank page. Structured gives you a timeline."
- 주간 = 일별 타임라인을 아이콘으로 압축해 나열. 월간 = 날짜별 아이콘.
- KO 앱스토어: "하루를 명확하고 간단하게 계획하세요." 합니다체+하세요 혼용.

## Calendly / Fantastical / Amie
- Calendly: 헤딩 `Select a Day` → `Select a Time` 2단계. 빈 상태 `No times in {Month}` + `Please select another date`. 잔여 `%{inviteesRemaining} spots left`. a11y 라벨로 `- Times available` / `- No times available`.
- Fantastical Openings: CTA가 `Confirm`이 아니라 **`Request Time`**(요청→승인 모델). 자연어 입력이 시그니처.
- Amie: Inter + InterDisplay, **`.tnum` 클래스로 tabular 명시**, 순수 무채 그레이 50단위 세분(50/75/100/150/...). 부킹 페이지 카피는 이모지·느낌표 없음(`Select a slot and add your details to confirm the event`), 체인지로그는 소문자+이모지 남발 → **제품 카피와 마케팅 카피를 분리**한 사례.

## 크몽·숨고 (국내)
- 둘 다 **Pretendard**(숨고는 woff2 name table 디코드로 확인, 400/500/600 3종).
- 숨고 2025 리브랜딩 퍼플. 톤은 해요체 일관: "혼자 하기 버거운 일이 생겼나요?", "사람 부르는 일, 끝까지 안심되게".
- 크몽은 해요체(마케팅)+합니다체(약관) 혼용.

## 결정에 직결되는 관찰
1. 캘린더 셀은 **날짜 + 아래 보조값 2줄**이 사실상 표준(Skyscanner, Google Flights, 우리 히트맵도 이미 이 구조).
2. 가용/불가 대비는 **채움 유무**로 만든다(Cal.com). 색이 아니라.
3. 셀을 카드처럼 띄우면 훑기가 무거워진다(Google Calendar 지적).
4. 상태어를 고정 사전으로 안 만들면 "이용 불가/사용 불가/사용할 수 없음"처럼 흔들린다(Cal.com KO).
5. 제품 카피와 마케팅 카피의 톤은 분리한다(Amie).
