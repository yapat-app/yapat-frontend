/**
 * Pure helpers for the Date range / Time-of-day sidebar filters. Recorded
 * dates are stored server-side as "YYYY-MM-DD" strings; filtering/binning
 * needs a plain number, so dates are converted to "epoch day" (days since the
 * Unix epoch, UTC) — recorded_time is already a plain number (seconds since
 * midnight) and needs no conversion.
 */
import dayjs, { type Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

const MS_PER_DAY = 86_400_000;

/** "2024-05-15" -> epoch day (UTC, explicit to avoid local-timezone drift). */
export function dateStringToEpochDay(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / MS_PER_DAY);
}

/** Epoch day -> short label for a histogram axis tick, e.g. "May 15". */
export function formatDateAxisLabel(epochDay: number): string {
  const d = new Date(epochDay * MS_PER_DAY);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "2024-05-15" -> 5 (1-12), for the month-of-year filter (year-independent). */
export function dateStringToMonth(dateStr: string): number {
  return Number(dateStr.slice(5, 7));
}

/** Short month labels for the Jan-Dec filter chips, index 0 = January. */
export const MONTH_ABBREVIATIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Epoch day -> a UTC-anchored Dayjs (midnight UTC of that day), for the calendar range picker. */
export function epochDayToDayjs(epochDay: number): Dayjs {
  return dayjs.utc(epochDay * MS_PER_DAY);
}

/** Dayjs -> epoch day (UTC), inverse of epochDayToDayjs. */
export function dayjsToEpochDay(d: Dayjs): number {
  return Math.floor(d.utc().valueOf() / MS_PER_DAY);
}

/** Seconds since midnight -> "HH:MM", e.g. 32400 -> "09:00". */
export function formatTimeAxisLabel(seconds: number): string {
  const clamped = Math.max(0, Math.min(86400, Math.round(seconds)));
  if (clamped === 86400) return "23:59";
  const h = Math.floor(clamped / 3600) % 24;
  const m = Math.floor((clamped % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
