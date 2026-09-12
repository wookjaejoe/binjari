"use client";

import { FILL, cx } from "@/components/ui";

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs text-subtle">
      <span className="flex items-center gap-1">
        적음
        <span className="flex gap-px">
          {[1, 2, 3, 4].map((level) => (
            <span key={level} className={cx("size-2.5 rounded-xs", FILL[level])} />
          ))}
        </span>
        많음
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2.5 rounded-xs border border-line" />
        마감
      </span>
      <span className="flex items-center gap-1">
        <span className="hatch size-2.5 rounded-xs opacity-60" />
        예약 기간 아님
      </span>
    </div>
  );
}
