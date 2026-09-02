import type { ViewMode } from "@/store/selection";

export const VIEWS: { value: ViewMode; label: string }[] = [
  { value: "heat", label: "히트맵" },
  { value: "stream", label: "목록" },
  { value: "matrix", label: "표" },
];

/**
 * 저장된 보기 값을 신뢰할 수 없을 때의 마지막 방어선.
 * persist 마이그레이션이 어긋나면(버전만 올라가고 값은 그대로) 알 수 없는
 * 값이 남는데, 그때 아무 화면도 렌더되지 않으면 앱이 죽은 것처럼 보인다.
 */
export function normalizeView(value: unknown): ViewMode {
  return VIEWS.some((view) => view.value === value)
    ? (value as ViewMode)
    : VIEWS[0].value;
}
