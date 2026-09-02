"use client";

import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function won(amount: number | null | undefined) {
  return amount == null ? "" : `${amount.toLocaleString("ko-KR")}원`;
}

/** 3만2천원 대신 3.2만 — 좁은 화면에서 요금이 줄바꿈을 만들지 않게. */
export function wonShort(amount: number | null | undefined) {
  if (amount == null) return "";
  if (amount < 10000) return `${(amount / 1000).toFixed(0)}천`;
  const man = amount / 10000;
  return `${Number.isInteger(man) ? man : man.toFixed(1)}만`;
}

/** 농도 4단 + 마감(0). fillLevel()의 반환값을 그대로 인덱스로 쓴다. */
export const FILL = [
  "bg-surface-2",
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
    <div className={cx("rounded-lg border border-line bg-surface", className)}>
      {children}
    </div>
  );
}

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
      className="inline-flex gap-0.5 rounded-lg bg-surface-2 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          type="button"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            "rounded-md font-medium whitespace-nowrap transition-colors",
            size === "sm" ? "px-2 py-1 text-[11.5px]" : "px-3 py-1.5 text-[13px]",
            value === option.value
              ? "bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              : "text-muted active:text-fg",
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
        "rounded-full border px-2.5 py-1 text-[12px] whitespace-nowrap transition-colors",
        disabled && "opacity-40",
        active
          ? "border-transparent bg-inverse font-semibold text-inverse-fg"
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
      className="flex items-center gap-2 text-[12px] text-muted"
    >
      <span
        className={cx(
          "relative inline-block h-4 w-7 shrink-0 rounded-full transition-colors",
          checked ? "bg-inverse" : "bg-line-strong",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-3 rounded-full bg-surface transition-[left]",
            checked ? "left-3.5" : "left-0.5",
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
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        state === "off"
          ? "border-line-strong"
          : "border-transparent bg-inverse text-inverse-fg",
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
        <span className="h-[1.6px] w-2.5 rounded-full bg-current" />
      )}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-fg",
        className,
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-[13.5px] font-medium">{title}</p>
      {hint && <p className="max-w-[28ch] text-[12px] leading-relaxed text-muted">{hint}</p>}
      {action}
    </div>
  );
}
