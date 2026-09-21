import { addDays, format, parse } from "date-fns";

export const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * 포털이 한국 시간으로 돌아가므로 "오늘"도 한국 시간이다. 서버가 UTC 인 곳(Vercel)에
 * 올리면 로컬 시간으로는 한국의 자정~아침 사이에 어제가 오늘로 잡힌다.
 * en-CA 로케일은 yyyy-MM-dd 로 찍힌다.
 */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function isoToCompact(iso: string): string {
  return iso.replaceAll("-", "");
}

export function compactToISO(compact: string): string {
  return format(parse(compact, "yyyyMMdd", new Date()), "yyyy-MM-dd");
}

export function shiftISO(iso: string, days: number): string {
  return format(addDays(parse(iso, "yyyy-MM-dd", new Date()), days), "yyyy-MM-dd");
}

export function enumerateDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  for (let d = startISO; d <= endISO; d = shiftISO(d, 1)) out.push(d);
  return out;
}

export function dowIndex(iso: string): number {
  return parse(iso, "yyyy-MM-dd", new Date()).getDay();
}

export function isWeekend(iso: string): boolean {
  const d = dowIndex(iso);
  return d === 0 || d === 6;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function formatShort(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
}

export function formatMonthDay(iso: string): string {
  return `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
}

export function formatLong(iso: string): string {
  return `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일(${DOW[dowIndex(iso)]})`;
}
