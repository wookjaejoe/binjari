"use client";

import type { CellState } from "@/lib/availability";
import { DOW, dayOfMonth, dowIndex, enumerateDates, monthKey, shiftISO } from "@/lib/date";
import { cx } from "@/components/ui";

export type StateOf = (date: string) => CellState;

/**
 * 칸을 그리지 않는 날. 이 캠핑장에 묻지 않은 날(unasked)과 화면에 열이 없는 날(오늘 이전,
 * 요일 필터로 빠진 날)이다. "데이터가 없다"는 칸이 없는 것으로 말한다 — 회색 면으로 그리면
 * 포털이 0을 준 없음과 구분되지 않는다.
 */
const drawn = (state: CellState | null): state is Exclude<CellState, "unasked"> =>
  state !== null && state !== "unasked";

/** 주말 라벨은 색이 아니라 진하기로 구분한다. 빨강은 오류에만 쓴다(DESIGN.md 1.1). */
export const dowTone = (dow: number) => (dow === 0 || dow === 6 ? "text-fg" : "text-subtle");

/**
 * 칸 하나의 면. 히트맵·달력·표가 같은 규칙을 쓴다(DESIGN.md 1.6).
 * 있음은 진한 무채색, 없음·모름은 한 톤 낮은 면, 조회 중은 그 면이 펄스한다.
 * 묻지 않은 날은 여기까지 오지 않는다 — 칸 자체를 그리지 않는다.
 */
export function cellTone(state: Exclude<CellState, "unasked">): string {
  // 중간 회색 위의 흰 숫자는 대비가 모자라다(3.4:1). 진한 글씨를 쓴다.
  if (state === "open") return "bg-fill text-fg";
  if (state === "loading") return "animate-pulse bg-empty";
  return "bg-empty text-muted";
}

/** 히트맵의 행 순서. 월요일부터라 토·일이 맨 아래 두 줄로 붙어 주말 띠가 된다. */
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
const rowOf = (date: string) => (dowIndex(date) + 6) % 7;

/**
 * 구역 카드의 주×요일 히트맵. 열이 주, 행이 요일(월–일)이다. GitHub 기여 그래프와 같은
 * 형식이지만 농도 단계는 없다 — 칸은 있음/없음/모름뿐이다.
 * 칸은 정사각이고 사이는 2px, 최대 12px이다. 칸은 누르지 않는다. 카드 전체가 달력 시트를 연다.
 */
export function WeekHeatmap({ span, stateOf }: { span: string[]; stateOf: StateOf }) {
  if (!span.length) return null;

  const first = span[0];
  const last = span.at(-1)!;
  const days = enumerateDates(shiftISO(first, -rowOf(first)), shiftISO(last, 6 - rowOf(last)));
  const weeks = days.length / 7;
  const inSpan = new Set(span);

  // 달 라벨은 1일이 든 주에 단다. 첫 주는 다음 1일이 3주 이상 뒤일 때만 — 붙어 있으면 겹친다.
  const labels: { week: number; month: string }[] = [];
  for (let week = 0; week < weeks; week += 1) {
    const firstOfMonth = days
      .slice(week * 7, week * 7 + 7)
      .find((date) => dayOfMonth(date) === 1 && date >= first && date <= last);
    if (firstOfMonth) labels.push({ week, month: firstOfMonth });
  }
  if (!labels.length || labels[0].week >= 3) labels.unshift({ week: 0, month: first });

  return (
    <div
      // justify-start 가 없으면 auto 인 요일 라벨 열이 남는 폭을 다 먹어 칸이 오른쪽으로 밀린다.
      className="grid justify-start gap-0.5"
      // 칸은 최대 12px. 크면 칸이 무늬가 아니라 덩어리로 읽혔다(18px). 카드 폭을 이 크기에
      // 맞추므로(ZoneCards) 대개 카드를 꽉 채운다.
      style={{ gridTemplateColumns: `auto repeat(${weeks}, minmax(0, 0.75rem))` }}
      aria-hidden
    >
      {labels.map(({ week, month }) => (
        <span
          key={month}
          className="pb-1 text-2xs leading-none whitespace-nowrap text-subtle"
          style={{ gridRow: 1, gridColumn: `${week + 2} / span 3` }}
        >
          {Number(monthKey(month).slice(5))}월
        </span>
      ))}

      {MON_FIRST.map((dow, row) => (
        <span
          key={dow}
          className={cx("self-center pr-1.5 text-2xs leading-none", dowTone(dow))}
          style={{ gridRow: row + 2, gridColumn: 1 }}
        >
          {DOW[dow]}
        </span>
      ))}

      {days.map((date, index) => {
        const state = inSpan.has(date) ? stateOf(date) : null;
        if (!drawn(state)) return null;
        return (
          <span
            key={date}
            className={cx(
              "flex aspect-square items-center justify-center rounded-xs text-2xs leading-none",
              cellTone(state),
            )}
            style={{ gridRow: rowOf(date) + 2, gridColumn: Math.floor(index / 7) + 2 }}
          >
            {state === "unknown" ? "?" : ""}
          </span>
        );
      })}
    </div>
  );
}

/**
 * 구역 시트의 달력. 달마다 일–토 7열, 칸은 정사각이다. 칸의 면은 히트맵과 같고, 있음만
 * 누를 수 있다 — 누르면 그 날의 상세가 열린다. 칸을 그리지 않는 날(묻지 않은 날·오늘 이전·
 * 요일 필터)은 면 없이 흐린 숫자다.
 */
export function MonthCalendars({
  span,
  stateOf,
  onPick,
}: {
  span: string[];
  stateOf: StateOf;
  onPick: (date: string) => void;
}) {
  if (!span.length) return null;
  const first = span[0];
  const last = span.at(-1)!;
  const inSpan = new Set(span);

  const months: string[] = [];
  for (let key = monthKey(first); key <= monthKey(last); key = nextMonth(key)) months.push(key);

  return (
    <div className="space-y-6">
      {months.map((key) => {
        const dates = enumerateDates(`${key}-01`, shiftISO(`${nextMonth(key)}-01`, -1));

        return (
          <section key={key}>
            <h3 className="pb-2 text-sm font-semibold num">{Number(key.slice(5))}월</h3>
            <div className="grid grid-cols-7 gap-1">
              {DOW.map((label, dow) => (
                <span key={label} className={cx("pb-1 text-center text-xs", dowTone(dow))}>
                  {label}
                </span>
              ))}
              {dates.map((date) => {
                const state = inSpan.has(date) ? stateOf(date) : null;
                const style =
                  dayOfMonth(date) === 1 ? { gridColumnStart: dowIndex(date) + 1 } : undefined;
                const base =
                  "relative flex aspect-square items-center justify-center rounded-sm text-sm num";

                if (state === "open") {
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => onPick(date)}
                      className={cx(base, cellTone(state), "font-semibold active:opacity-70")}
                      style={style}
                    >
                      {dayOfMonth(date)}
                    </button>
                  );
                }
                return (
                  <span
                    key={date}
                    // 칸이 없는 날의 숫자는 --subtle 이다. --line-strong 은 너무 흐려 읽히지 않았다.
                    // 없음 칸의 숫자(--muted, 회색 면 위)와는 면이 있고 없음으로 갈린다.
                    className={cx(base, drawn(state) ? cellTone(state) : "text-subtle")}
                    style={style}
                  >
                    {dayOfMonth(date)}
                    {state === "unknown" && (
                      <span className="absolute top-1 right-1.5 text-2xs leading-none">?</span>
                    )}
                  </span>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function nextMonth(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}
