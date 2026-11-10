import { t } from "../../i18n/t";

const SECOND = 1000;
const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * SECOND],
  ["month", 30 * 24 * 60 * 60 * SECOND],
  ["day", 24 * 60 * 60 * SECOND],
  ["hour", 60 * 60 * SECOND],
  ["minute", 60 * SECOND],
];

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * How long ago `at` was, e.g. "2 minutes ago", "yesterday"; under a minute (or a
 * little in the future, from another device's clock) "just now".
 */
export function relativeTime(at: number, now: number): string {
  const ago = now - at;
  for (const [unit, size] of UNITS)
    if (ago >= size) return RELATIVE.format(-Math.floor(ago / size), unit);
  return t("time.justNow");
}

/** Whole KB (1,024 bytes); any data at all counts as at least 1 KB. */
export function kilobytes(bytes: number): number {
  if (bytes <= 0) return 0;
  return Math.max(1, Math.round(bytes / 1024));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `lingo-backup-YYYY-MM-DD.json`, by the local date. */
export function backupFileName(date: Date): string {
  return `lingo-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** Both times fall on the same local calendar day. */
export function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Today", "Nov 6" within this year, else "Nov 6, 2025" (local dates). */
export function shortDate(at: number, now: number): string {
  if (sameDay(at, now)) return t("time.today");
  return new Date(at).getFullYear() === new Date(now).getFullYear()
    ? MONTH_DAY.format(at)
    : MONTH_DAY_YEAR.format(at);
}
