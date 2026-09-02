"use client";

import { useEffect, type ReactNode } from "react";

import { cx } from "@/components/ui";

/**
 * 모바일 우선 바텀 시트. 데스크톱에서는 화면 가운데로 올라온다.
 * 열려 있는 동안 배경 스크롤을 잠근다.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "relative flex max-h-[88vh] w-full flex-col rounded-t-2xl border border-line bg-surface",
          "sm:max-h-[80vh] sm:max-w-lg sm:rounded-2xl",
          "animate-[sheet-in_.18s_cubic-bezier(.2,.8,.2,1)]",
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-4 pt-3.5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mt-0.5 -mr-1 flex size-7 items-center justify-center rounded-md text-muted active:bg-surface-2"
            aria-label="닫기"
          >
            <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden>
              <path
                d="M2 2l10 10M12 2L2 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {footer && (
          <footer className="shrink-0 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </div>

      <style>{`@keyframes sheet-in{from{transform:translateY(12px);opacity:.6}to{transform:none;opacity:1}}`}</style>
    </div>
  );
}
