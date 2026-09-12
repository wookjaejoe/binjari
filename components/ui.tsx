"use client";

import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function won(amount: number | null | undefined) {
  return amount == null ? "" : `${amount.toLocaleString("ko-KR")}원`;
}

/** 3만 2천원 대신 3.2만 — 좁은 화면에서 요금이 줄바꿈을 만들지 않게. */
export function wonShort(amount: number | null | undefined) {
  if (amount == null) return "";
  if (amount < 10000) return `${(amount / 1000).toFixed(0)}천`;
  const man = amount / 10000;
  return `${Number.isInteger(man) ? man : man.toFixed(1)}만`;
}

/**
 * 농도 4단 + 마감(0). fillScale()이 돌려준 단계를 그대로 인덱스로 쓴다.
 * 액센트의 저채도 틴트라 색상은 화면 전체에서 하나뿐이다 — DESIGN.md 1.1.
 */
export const FILL = [
  "bg-transparent",
  "bg-fill-1",
  "bg-fill-2",
  "bg-fill-3",
  "bg-fill-4",
] as const;

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-md border border-line bg-surface", className)}>
      {children}
    </div>
  );
}

/**
 * 뷰 전환 탭. 활성은 색으로 말한다 — 다크에서는 그림자가 없어서 배경 차이만으로는
 * 어느 쪽이 선택됐는지 읽히지 않는다.
 */
export function SegBar<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className="inline-flex gap-0.5 rounded-md bg-surface-2 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          type="button"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            // 굵기는 상태에 따라 바꾸지 않는다. 세그먼트에서 굵기가 바뀌면 그 탭의
            // 폭이 늘어 옆 탭이 밀린다. 구분은 색과 배경이 한다.
            "rounded-sm font-medium whitespace-nowrap transition-colors",
            size === "sm" ? "px-2.5 py-2 text-xs" : "px-3 py-2.5 text-sm",
            value === option.value
              ? "bg-surface text-accent elev-1"
              : "text-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  children,
  active,
  onClick,
  disabled,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
        disabled && "opacity-40",
        active
          ? "border-transparent bg-accent font-medium text-accent-fg"
          : "border-line text-muted",
      )}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-xs text-muted"
    >
      <span
        className={cx(
          "relative inline-block h-4 w-7 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-3 rounded-full bg-surface transition-[translate]",
            checked ? "left-0.5 translate-x-3" : "left-0.5",
          )}
        />
      </span>
      {children}
    </button>
  );
}

export function Check({
  state,
  onChange,
  label,
}: {
  state: "on" | "off" | "partial";
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "partial" ? "mixed" : state === "on"}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange(state !== "on");
      }}
      className={cx(
        "flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors",
        state === "off"
          ? "border-line-strong"
          : "border-transparent bg-accent text-accent-fg",
      )}
    >
      {state === "on" && (
        <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
          <path
            d="M2.5 6.2l2.2 2.3L9.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {state === "partial" && (
        <span className="h-0.5 w-2.5 rounded-full bg-current" />
      )}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block size-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent",
        className,
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-sm bg-surface-2", className)} />;
}

export function Empty({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-base font-medium">{title}</p>
      {action}
    </div>
  );
}
