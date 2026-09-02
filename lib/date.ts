import { addDays, format, parse } from "date-fns";

export const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
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

export function formatLong(iso: string): string {
  return `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일(${DOW[dowIndex(iso)]})`;
}
