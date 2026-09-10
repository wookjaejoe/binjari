# 조사 1: 숙박·여행 (요약 — 결정에 쓸 것만)

## verified 값
- Airbnb: Cereal(6웨이트, 작게 쓰일 때 aperture 확대), Rausch #FF385C 는 주요 액션에만, Ink #222 / Hof #484848 / Foggy #767676 (3자 관찰). 카드는 보더·그림자 없이 사진+여백. 캘린더는 이진(가능=흰, 불가=취소선). "Rare find", "I'm Flexible", 스와이프 범위 선택.
- Skyscanner(Backpack 토큰, verified JSON): Sky Blue #0062E3, Dark Sky #05203C, text #161616 / #626971, canvas #FFF / night #010913, surface night #131D2B; success #0C838A, warning #F55D42, danger #E70866; radius 4/8/12/24/40/full; shadow SM `0 1px 3px rgba(37,32,31,.3)`; spacing .125/.25/.5/1/1.5/2/2.5/4/6rem. 세리프 Larken 은 "key Product screens or inventory cards 에서 배제" — 개성 서체는 재고·가격 화면에서 뺀다는 명문 규칙.
- Hopper: 캘린더 셀 전체를 4단 서열 색(녹→노→주→빨)+범례. "Wait"는 회색 박스. 느낌표·대화체 다용. 로딩을 토끼 애니메이션으로.
- Google Flights: 캘린더에 날짜별 최저가 숫자, **최저만 녹색, 나머지 중립**. 인사이트 low/typical/high 3단 + "$93 cheaper than usual" 문장. 느낌표·이모지 없음, 서술체.
- Kayak: 불확실성을 카피로 인정("generally correct more often than not"), 알림 하루 1회 묶음.
- Recreation.gov: 행=사이트, 열=야간, 문자 코드 A/R/X/NR/FF/W + 색(가능 파랑, 예약/불가 회색, 미공개 주황). 전환일 반분할 셀. 학습 비용 있음(가이드가 행/열 스캔 둘 다 설명).
- 국립공원 예약: 월 캘린더 셀에 "예약가능: N / 대기가능: N" 두 줄. 공공 포털은 숫자로 말함. 격식체 "~하시기 바랍니다".
- 숲나들e: 캘린더 없이 "예약가능 시설만 보기" 필터 + 목록/지도.
- Hipcamp Alerts: "Set up a free alert → Wait for a notification → Snag the opening", 15초 스캔, 무료.
- The Dyrt: "We scan sold-out campgrounds and let you know (via text) when a campsite you want opens up." "that doesn't mean all hope is lost."
- 캠핏: "빈자리 알림" + "빈자리 줄서기"(선결제 대기). "금방 마감돼요!", "포기 금지" 해요체+느낌표.
- 땡큐캠핑: "인기 캠핑장의 빈자리 및 예약오픈 알림", "잔여석 확인", "마감임박" 배지, "올 가을엔 어디로 캠핑을 떠날까요?".
- 야놀자→NOL 2025: 핑크→블루, "정제된 여백과 시스템적인 안정감", "차분하고 전문적인". 여기어때 2025 비주얼 에셋 재정의. → 국내 OTA 둘 다 "경쾌"에서 "차분·정제"로 이동 중.
- 한국 상업 앱 톤: 해요체+느낌표(트리플 "골라줘요", 캠핏 "마감돼요!", 마이리얼트립 "되셨나요?"), NOL 은 명사형+반말 의문("뭐 하고 놀지?"). 공공은 격식 존대.

## 교차
- 브랜드 서체는 헤드라인용, 본문은 별도(국내는 Pretendard 수렴). 개성 서체는 재고·가격 화면에서 제외(Skyscanner 명문).
- 브랜드 색은 CTA·선택 상태에만, 캔버스 흰색, 텍스트 순흑 아님.
- **가용성 색: 녹색=좋음/가능 으로 수렴. 없음/마감 = 회색. 빨강 = "비쌈" 또는 "서두르라"(Booking/Agoda 희소성 다크패턴, 제재 이력).** 즉 "없음"과 "서두르라"는 색으로 구분되는 관행.
- 희소성 어휘 두 갈래: 조작형("Only 1 room left!", "놓치지 마세요!") vs 사실형("Rare find", "cheaper than usual", 범례 문자, 잔여 숫자). 
- 캠핑 도메인은 "표시"와 "감시"가 한 제품에 공존. 감시 카피는 "취소표/빈자리/opens up"을 쓰고 "마감"을 전제 상태로 둠.
- 연속값 캘린더는 예외 없이 "실시간 아님/추정"을 문구로 밝힘.

## 다중 날짜 표시 유형
A 숫자 캘린더(최저만 강조: Google) / B 서열 색 전 셀(Hopper) / E 사이트×날짜 매트릭스(Rec.gov) / F 카운트 캘린더(국립공원) / G 이진(Airbnb) / J 감시형.
빈자리 현재 = B(농도) + F(숫자) 결합, 표 뷰 = E.
