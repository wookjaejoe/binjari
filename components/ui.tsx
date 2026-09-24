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

export function Spinner({ className, onInk }: { className?: string; onInk?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block size-3.5 animate-spin rounded-full border-2",
        onInk ? "border-on-ink/20 border-t-on-ink" : "border-line-strong border-t-accent",
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
