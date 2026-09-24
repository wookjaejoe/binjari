"use client";

import { Sheet, type SheetAnchor } from "@/components/Sheet";
import { cx } from "@/components/ui";
import { DOW } from "@/lib/date";

const DOW_PRESETS: { label: string; dows: number[] }[] = [
  { label: "제한 없음", dows: [] },
  { label: "금·토", dows: [5, 6] },
  { label: "주말", dows: [0, 5, 6] },
  { label: "평일", dows: [1, 2, 3, 4] },
];

/** 포털 한도와 무관한 고정 목록. 한도를 넘겨 물어도 포털은 오류 없이 0 을 준다. */
const NIGHTS = [1, 2, 3, 4, 5, 6, 7];

export function NightsSheet({
  open,
  nights,
  anchor,
  onClose,
  onPick,
}: {
  open: boolean;
  nights: number;
  anchor?: SheetAnchor | null;
  onClose: () => void;
  onPick: (nights: number) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="숙박일수"
      anchor={anchor}
    >
      <ul className="p-2">
        {NIGHTS.map((value) => (
          <li key={value}>
            <button
              type="button"
              onClick={() => {
                onPick(value);
                onClose();
              }}
              className={cx(
                "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left active:bg-surface-2",
                value === nights && "bg-surface-2",
              )}
            >
              <span
                className={cx(
                  "text-base num",
                  value === nights ? "font-semibold" : "font-normal",
                )}
              >
                {value}박
              </span>
              {value === nights && (
                <svg
                  viewBox="0 0 12 12"
                  className="ml-auto size-3.5 shrink-0"
                  aria-hidden
                >
                  <path
                    d="M2 6.4l2.6 2.6L10 3.6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function DowSheet({
  open,
  dows,
  anchor,
  onClose,
  onChange,
}: {
  open: boolean;
  dows: number[];
  anchor?: SheetAnchor | null;
  onClose: () => void;
  onChange: (dows: number[]) => void;
}) {
  const active = dows.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : dows;
  const unrestricted = dows.length === 0;

  const toggle = (dow: number) => {
    const next = active.includes(dow)
      ? active.filter((value) => value !== dow)
      : [...active, dow];
    onChange(next);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="체크인 요일"
      anchor={anchor}
    >
      <div className="p-4">
        <div className="flex gap-1.5">
          {DOW.map((label, dow) => {
            const on = active.includes(dow);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(dow)}
                className={cx(
                  "flex flex-1 flex-col items-center gap-1 rounded-lg border py-2.5 text-sm",
                  on
                    ? "border-transparent bg-accent font-medium text-accent-fg"
                    : "border-line text-muted",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {DOW_PRESETS.map((preset) => {
            const on =
              preset.dows.length === 0
                ? unrestricted
                : !unrestricted &&
                  preset.dows.length === dows.length &&
                  preset.dows.every((dow) => dows.includes(dow));
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(preset.dows)}
                className={cx(
                  "rounded-full border px-3 py-1.5 text-xs",
                  on
                    ? "border-transparent bg-surface-2 font-semibold text-fg"
                    : "border-line text-muted",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {active.length === 0 && (
          <p className="mt-4 text-xs text-error">
            고른 요일이 없어요.
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** 조건 바에 표시할 짧은 요약. */
export function dowLabel(dows: number[]) {
  if (dows.length === 0) return "요일 전체";
  if (dows.length === 7) return "요일 전체";
  const preset = DOW_PRESETS.find(
    (item) =>
      item.dows.length === dows.length &&
      item.dows.every((dow) => dows.includes(dow)),
  );
  if (preset && preset.dows.length) return preset.label;
  return dows.map((dow) => DOW[dow]).join("·");
}
