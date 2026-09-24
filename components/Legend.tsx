"use client";

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs text-subtle">
      <span className="flex items-center gap-1">
        <span className="size-3 rounded-xs bg-fill" />
        있음
      </span>
      <span className="flex items-center gap-1">
        <span className="size-3 rounded-xs bg-empty" />
        없음
      </span>
      <span className="flex items-center gap-1">
        <span className="flex size-2.5 items-center justify-center rounded-xs bg-empty text-2xs leading-none num">
          ?
        </span>
        모름
      </span>
    </div>
  );
}
