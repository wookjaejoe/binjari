"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";

import { cx } from "@/components/ui";

/** 데스크톱 팝오버 폭. sm:max-w-md 와 같아야 한다. */
const POPOVER_WIDTH = 448;

/** 시트를 연 버튼의 위치. 데스크톱에서 그 아래에 붙인다. */
export type SheetAnchor = { top: number; left: number };

export function anchorOf(element: HTMLElement): SheetAnchor {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.bottom + 8,
    left: Math.max(16, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 16)),
  };
}

/**
 * 모바일 우선 바텀 시트. 열려 있는 동안 배경 스크롤을 잠근다.
 *
 * 데스크톱에서 `anchor`가 있으면 그 버튼 아래에 팝오버로 붙는다. 왼쪽 위 버튼을 눌렀는데
 * 화면 한가운데에 뜨면 무엇을 눌러 열린 것인지 끊긴다. 조건 버튼처럼 연 자리가 분명한
 * 시트가 여기에 해당한다. `anchor`가 없으면(날짜 상세, 빈 상태의 버튼) 가운데로 올라온다.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  anchor,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  anchor?: SheetAnchor | null;
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
        className={cx(
          "absolute inset-0 bg-fg/35 backdrop-blur-xs",
          // 팝오버는 연 버튼과 이어져 보여야 해서 뒤를 흐리지 않고 살짝만 누른다.
          anchor && "sm:bg-fg/10 sm:backdrop-blur-none",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={
          anchor
            ? ({ "--sheet-top": `${anchor.top}px`, "--sheet-left": `${anchor.left}px` } as CSSProperties)
            : undefined
        }
        className={cx(
          "relative flex max-h-[88vh] w-full flex-col rounded-t-lg border border-line bg-surface elev-2",
          // 데스크톱은 카드와 같은 언어로 — radius-xl, 보더 없이 그림자만(DESIGN.md 1.3).
          "sm:rounded-xl sm:border-transparent",
          anchor
            ? "sm:absolute sm:top-(--sheet-top) sm:left-(--sheet-left) sm:max-h-[calc(100dvh-var(--sheet-top)-24px)] sm:max-w-md"
            : "sm:max-h-[80vh] sm:max-w-lg",
          "sheet-in",
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
            className="-mt-0.5 -mr-1 flex size-8 items-center justify-center rounded-sm text-muted active:bg-surface-2"
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
    </div>
  );
}
