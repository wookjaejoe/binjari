"use client";

import Image from "next/image";
import { useState } from "react";

import { Sheet } from "@/components/Sheet";
import { MonthCalendars, WeekHeatmap, type StateOf } from "@/components/ZoneCalendars";
import { evaluate, type CampData, type Row } from "@/lib/availability";
import type { ZoneSelection } from "@/store/selection";

type ZoneRow = Extract<Row, { kind: "zone" }>;

type Selection = Record<string, Record<string, ZoneSelection>>;

type Props = {
  rows: Row[];
  /** 요일 필터만 걸린 날짜 열. "빈 날만"으로 거르지 않은 것 — 히트맵에 구멍이 나면 안 된다. */
  dates: string[];
  data: CampData[];
  selection: Selection;
  onPick: (campId: string, date: string) => void;
};

/**
 * 표 위에서 같은 데이터를 행(자리) 관점으로 먼저 보여준다. 캠핑장마다 사진 카드를
 * 가로로 넘긴다. 순위·"가장 많은" 같은 판단은 하지 않는다. 일수를 세어 합계를 내지도
 * 않는다 — 칸이 말한다. 근거는 DESIGN.md 1.7·1.8.
 */
export function ZoneCards({ rows, dates, data, selection, onPick }: Props) {
  const [opened, setOpened] = useState<string | null>(null);

  const zoneRows = rows.filter((row): row is ZoneRow => row.kind === "zone");
  if (!zoneRows.length) return null;

  const groups: { campId: string; campName: string; rows: ZoneRow[] }[] = [];
  for (const row of zoneRows) {
    const last = groups.at(-1);
    if (last && last.campId === row.campId) last.rows.push(row);
    else groups.push({ campId: row.campId, campName: row.campName, rows: [row] });
  }

  const stateOf =
    (row: ZoneRow): StateOf =>
    (date) =>
      evaluate(row, date, data, selection).state;

  // 시트가 열린 사이 선택에서 빠진 구역이면 닫힌 것으로 본다.
  const openedRow = zoneRows.find((row) => row.key === opened);

  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <section key={group.campId}>
          <div className="flex items-baseline justify-between px-5 pb-3">
            <h2 className="text-lg font-bold">{group.campName}</h2>
            <span className="text-xs text-muted num">{group.rows.length}구역</span>
          </div>
          {/* 모바일은 스와이프로 넘기고 다음 카드가 걸쳐 보인다. 데스크톱에는 스와이프가 없고
              숨긴 가로 스크롤은 마우스로 조작할 방법이 안 보이므로, 넘기지 않고 격자로 편다.
              카드 폭은 히트맵(칸 최대 12px)에 맞춘다 — 모바일 240px, 데스크톱 3열. 카드를 넓게
              두고 히트맵만 줄였더니 카드 아래쪽 절반이 일하지 않는 빈 공간이 됐다.
              아래 패딩은 카드 그림자 자리다. rail 이 overflow 로 잘라낸다. */}
          <ul className="rail flex snap-x snap-mandatory scroll-px-5 gap-3 px-5 pb-6 sm:grid sm:grid-cols-2 sm:overflow-visible md:grid-cols-3">
            {group.rows.map((row) => (
              // 히트맵·달력·표가 전부 같은 시간축(화면의 날짜 열 전체)을 쓴다. 캠핑장 기간만
              // 그렸더니 1월까지인 카드는 15주, 10월까지인 카드는 6주라 카드마다 밀도가 달랐고,
              // 히트맵은 1월까지인데 누르면 달력은 10월에서 끝났다. 그 캠핑장에 묻지 않은 날은
              // 칸을 그리지 않는다 — 없음과 다르다(DESIGN.md 1.6).
              <ZoneCard
                key={row.key}
                row={row}
                span={dates}
                stateOf={stateOf(row)}
                onOpen={() => setOpened(row.key)}
              />
            ))}
          </ul>
        </section>
      ))}

      {openedRow && (
        <Sheet
          open
          onClose={() => setOpened(null)}
          title={openedRow.label}
          subtitle={[openedRow.campName, openedRow.ground].filter(Boolean).join(" · ")}
        >
          <div className="px-4 pt-4 pb-6">
            <MonthCalendars
              span={dates}
              stateOf={stateOf(openedRow)}
              onPick={(date) => {
                setOpened(null);
                onPick(openedRow.campId, date);
              }}
            />
          </div>
        </Sheet>
      )}
    </div>
  );
}

/**
 * 카드 전체가 달력 시트를 여는 버튼이다. "전체 보기" 같은 문구는 두지 않는다 — 떠 있는
 * 카드는 그 자체로 누를 것처럼 생겼고, 누르면 달력이 열린다.
 */
function ZoneCard({
  row,
  span,
  stateOf,
  onOpen,
}: {
  row: ZoneRow;
  span: string[];
  stateOf: StateOf;
  onOpen: () => void;
}) {
  return (
    <li className="w-60 shrink-0 snap-start sm:w-auto">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-xl bg-surface p-1.5 text-left elev-card transition-transform active:scale-99"
      >
        {/* 사진 위 글자는 아래쪽 ink 그라데이션 위에만 얹는다. 포털 사진은 밝기가 제각각이다. */}
        <div className="relative h-36 overflow-hidden rounded-lg bg-ink">
          {row.photo ? (
            <Image src={row.photo} alt="" fill sizes="320px" className="object-cover" />
          ) : (
            // 포털이 사진을 안 준 구역이다(MASTER_IMAGE 가 빈 값). 깨진 이미지로 읽히지 않게 말한다.
            <span className="absolute top-2.5 left-3 text-xs text-on-ink/45">사진 없음</span>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/80 to-transparent px-3 pt-8 pb-2.5 text-on-ink">
            <p className="truncate text-base font-bold">{row.label}</p>
            {row.ground && <p className="truncate text-xs text-on-ink/75">{row.ground}</p>}
          </div>
        </div>

        <div className="px-2 pt-3 pb-2">
          <WeekHeatmap span={span} stateOf={stateOf} />
        </div>
      </button>
    </li>
  );
}
