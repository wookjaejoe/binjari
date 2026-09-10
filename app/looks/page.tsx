"use client";

/**
 * 디자인 방향 비교용 임시 화면. 결정이 나면 지운다.
 * 실제 조회 데이터(9/3~10/31 고성군 2곳 6구역 1박)를 그대로 박아 두고
 * 같은 값을 세 가지 언어로 그린다.
 */

const SEP = [
  6, 13, 5, 8, 13, 21, 23, 22, 10, 4, 15, 19, 23, 22, 18, 9, 2, 20, 22, 21, 15,
  2, 1, 1, 9, 20, 19, 20,
];
const OCT: (number | null)[] = [
  8, 4, null, null, 7, 8, 8, 7, null, null, 5, 9, 9, 9, 9, 9, null, 7, 8, 9, 9,
  9, 7, null, 8, 9, 9, 9, 9, 8, null,
];

type Day = { month: number; day: number; dow: number; open: number | null };

const DAYS: Day[] = [
  ...SEP.map((open, i) => {
    const day = i + 3;
    return { month: 9, day, dow: new Date(2026, 8, day).getDay(), open };
  }),
  ...OCT.map((open, i) => {
    const day = i + 1;
    return { month: 10, day, dow: new Date(2026, 9, day).getDay(), open };
  }),
];

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** 값의 종류 위에서 매긴 순위 → 1~4단. lib/policy.ts의 fillScale과 같은 규칙. */
const distinct = [...new Set(DAYS.map((d) => d.open).filter((v): v is number => !!v))].sort(
  (a, b) => a - b,
);
function level(open: number | null): 0 | 1 | 2 | 3 | 4 {
  if (!open) return 0;
  const span = distinct.length - 1;
  let rank = 0;
  while (rank < span && distinct[rank + 1] <= open) rank++;
  return (1 + Math.round((rank / span) * 3)) as 1 | 2 | 3 | 4;
}

/** 주 단위로 쪼갠다. 앞쪽 빈칸은 첫날 요일만큼. */
function weeks(): (Day | null)[][] {
  const cells: (Day | null)[] = [
    ...Array(DAYS[0].dow).fill(null),
    ...DAYS,
  ];
  while (cells.length % 7) cells.push(null);
  const out: (Day | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
  return out;
}
const WEEKS = weeks();

/** 그 주에 처음 등장하는 달 */
function monthOf(week: (Day | null)[], index: number): number | null {
  const seen = WEEKS.slice(0, index)
    .flat()
    .filter(Boolean)
    .map((d) => d!.month);
  const fresh = week.filter(Boolean).map((d) => d!.month).find((m) => !seen.includes(m));
  return fresh ?? null;
}

export default function Looks() {
  return (
    <>
      {/* C안 전용 명조체. 이 비교 화면에서만 쓰고 방향이 정해지면 이 파일과 함께 지운다. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap"
      />
      <style>{CSS}</style>
      <div className="lk-wrap">
        <LedgerTimetable />
        <AnswerFirst />
        <PaperBook />
      </div>
    </>
  );
}

/* ────────────────────────── A. 장부 · 시각표 ────────────────────────── */

function LedgerTimetable() {
  return (
    <section id="look-a" className="a">
      <div className="a-head">
        <b>빈자리</b>
        <span>고성군 공공캠핑장</span>
        <i>09.04 09:26</i>
      </div>
      <div className="a-cond">
        <span>2곳 6구역 · 1박 · 요일 전체</span>
        <b>52일</b>
      </div>

      <table className="a-grid">
        <thead>
          <tr>
            <th />
            {DOW.map((d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKS.map((week, wi) => (
            <tr key={wi}>
              <th>{monthOf(week, wi) ?? ""}</th>
              {week.map((d, i) => (
                <td key={i} className={d ? `l${level(d.open)}` : ""}>
                  {!d ? (
                    ""
                  ) : d.open === null ? (
                    <span className="a-off">/</span>
                  ) : (
                    <>
                      <em>{d.day}</em>
                      <b>{d.open}</b>
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="a-foot">
        아래 숫자가 열린 자리. 진할수록 여유롭다. / 는 예약 기간 밖.
      </p>
    </section>
  );
}

/* ────────────────────────── B. 답을 먼저 ────────────────────────── */

const BEST = [...DAYS].filter((d) => d.open).sort((a, b) => b.open! - a.open!);
const WEEKEND = DAYS.filter((d) => d.open && (d.dow === 5 || d.dow === 6)).sort(
  (a, b) => b.open! - a.open!,
)[0];

function AnswerFirst() {
  return (
    <section id="look-b" className="b">
      <div className="b-top">
        <b>빈자리</b>
        <button type="button">2곳 · 1박 · 전체</button>
      </div>

      <div className="b-answer">
        <p className="b-label">가장 여유로운 주말</p>
        <p className="b-date">
          9월 {WEEKEND.day}일 <small>{DOW[WEEKEND.dow]}</small>
        </p>
        <p className="b-count">
          <strong>{WEEKEND.open}</strong>자리 <span>2곳</span>
        </p>
      </div>

      <p className="b-sub">자리가 가장 많은 날</p>
      <ol className="b-list">
        {BEST.slice(0, 4).map((d) => (
          <li key={`${d.month}-${d.day}`}>
            <span>
              {d.month}/{d.day} <i>{DOW[d.dow]}</i>
            </span>
            <b>{d.open}</b>
          </li>
        ))}
      </ol>

      <p className="b-more">60일 전체 보기</p>

      <div className="b-mini">
        {WEEKS.map((week, wi) => (
          <div key={wi} className="b-row">
            {week.map((d, i) => (
              <span key={i} className={d?.open ? `m${level(d.open)}` : "m0"}>
                {d?.open ?? ""}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────── C. 종이 대장 ────────────────────────── */

function PaperBook() {
  const rows = DAYS.slice(24, 39);
  return (
    <section id="look-c" className="c">
      <div className="c-head">
        <h1>빈자리</h1>
        <p>고성군 공공캠핑장 예약 대장</p>
        <p className="c-meta">九月 · 2곳 6구역 · 1박</p>
      </div>

      <table className="c-book">
        <tbody>
          {rows.map((d) => (
            <tr key={`${d.month}-${d.day}`}>
              <td className="c-date">
                {d.month}월 {d.day}일
                <i>{DOW[d.dow]}</i>
              </td>
              <td className="c-val">
                {d.open === null ? (
                  <span className="c-off">기간 밖</span>
                ) : d.open === 0 ? (
                  <span className="c-stamp">滿</span>
                ) : (
                  <>
                    <b>{d.open}</b>
                    <i>자리</i>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="c-foot">이하 10월 31일까지 계속</p>
    </section>
  );
}

const CSS = `
.lk-wrap{max-width:390px;margin:0 auto}
.lk-wrap>section{margin:0 0 40px}

/* ── A. 장부 · 시각표 ── */
.a{background:#fff;color:#14130f;padding:14px 16px 24px;
   font-feature-settings:"tnum";font-variant-numeric:tabular-nums}
.a-head{display:flex;align-items:baseline;gap:8px;padding-bottom:8px}
.a-head b{font-size:15px;font-weight:700;letter-spacing:.04em}
.a-head span{font-size:11px;color:#8a8578}
.a-head i{margin-left:auto;font-style:normal;font-size:11px;color:#8a8578}
.a-cond{display:flex;justify-content:space-between;align-items:baseline;
   border-top:1px solid #14130f;border-bottom:1px solid #14130f;padding:6px 0;
   font-size:11px;color:#55514a}
.a-cond b{font-size:12px;color:#14130f}
.a-grid{width:100%;border-collapse:collapse;margin-top:10px}
.a-grid th{font-weight:400;font-size:10px;color:#8a8578;padding-bottom:4px;text-align:center}
.a-grid tbody th{width:14px;text-align:left;font-size:10px;color:#8a8578;
   vertical-align:middle}
.a-grid td{height:30px;text-align:center;border-bottom:1px solid #e8e5dd;
   line-height:1;vertical-align:middle}
.a-grid td em{display:block;font-style:normal;font-size:9px;color:#a8a396;margin-bottom:2px}
.a-grid td b{display:block;font-size:14px;font-weight:400;color:#a8a396}
.a-grid td.l1 b{font-weight:400;color:#918c7e}
.a-grid td.l2 b{font-weight:500;color:#5d584c}
.a-grid td.l3 b{font-weight:600;color:#2b2721}
.a-grid td.l4 b{font-weight:700;color:#14130f}
.a-off{color:#d6d2c8;font-size:12px}
.a-foot{margin-top:10px;font-size:10px;color:#8a8578;letter-spacing:.01em}

/* ── B. 답을 먼저 ── */
.b{background:#fff;color:#14130f;padding:16px 20px 24px}
.b-top{display:flex;align-items:center;justify-content:space-between}
.b-top b{font-size:13px;font-weight:600}
.b-top button{border:0;background:none;font:inherit;font-size:11px;color:#8a8578;
   padding:0}
.b-answer{padding:28px 0 20px}
.b-label{font-size:12px;color:#8a8578;margin:0 0 6px}
.b-date{margin:0;font-size:40px;font-weight:700;letter-spacing:-.03em;line-height:1}
.b-date small{font-size:18px;font-weight:500;color:#8a8578;letter-spacing:0}
.b-count{margin:10px 0 0;font-size:15px;color:#55514a}
.b-count strong{font-size:22px;font-weight:600;color:#14130f}
.b-count span{color:#8a8578}
.b-sub{margin:0 0 2px;font-size:11px;color:#a8a396}
.b-list{list-style:none;margin:0;padding:0;border-top:1px solid #eceae4}
.b-list li{display:flex;justify-content:space-between;align-items:baseline;
   padding:11px 0;border-bottom:1px solid #eceae4;font-size:13px;color:#55514a}
.b-list li i{font-style:normal;color:#a8a396;font-size:11px}
.b-list li b{font-size:15px;font-weight:600;color:#14130f;
   font-variant-numeric:tabular-nums}
.b-more{margin:14px 0 0;font-size:12px;color:#8a8578}
.b-mini{margin-top:22px;opacity:.5}
.b-row{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:2px}
.b-row span{height:20px;border-radius:2px;font-size:9px;line-height:20px;
   text-align:center;color:#6f6a5f;font-variant-numeric:tabular-nums}
.m0{background:#f2f0ea}.m1{background:#dedbd2}.m2{background:#bcb8ab}
.m3{background:#8d8879;color:#fff}.m4{background:#57534a;color:#fff}

/* ── C. 종이 대장 ── */
.c{background:#f4eee0;color:#2e2620;padding:20px 20px 28px;
   font-family:"Gowun Batang",serif}
.c-head{border-bottom:2px solid #2e2620;padding-bottom:10px}
.c-head h1{margin:0;font-size:26px;font-weight:700;letter-spacing:.08em}
.c-head p{margin:4px 0 0;font-size:12px;color:#6b5f52}
.c-head .c-meta{margin-top:2px;font-size:11px;color:#8a7c6c;letter-spacing:.06em}
.c-book{width:100%;border-collapse:collapse;margin-top:6px}
.c-book td{border-bottom:1px solid #d3c6ad;padding:9px 0;vertical-align:baseline}
.c-date{font-size:14px}
.c-date i{font-style:normal;margin-left:6px;font-size:11px;color:#8a7c6c}
.c-val{text-align:right;white-space:nowrap}
.c-val b{font-size:19px;font-weight:700}
.c-val i{font-style:normal;font-size:11px;color:#6b5f52;margin-left:3px}
.c-off{font-size:11px;color:#a8987f}
.c-stamp{display:inline-block;border:1.5px solid #a33;color:#a33;border-radius:50%;
   width:24px;height:24px;line-height:21px;text-align:center;font-size:13px;
   transform:rotate(-8deg)}
.c-foot{margin:10px 0 0;font-size:11px;color:#8a7c6c;text-align:center}
`;
