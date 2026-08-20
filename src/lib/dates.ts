/**
 * All date maths for the app. Everything here works on "YYYY-MM-DD" strings
 * in the LOCAL calendar, never UTC.
 *
 * Why this file exists: `new Date().toISOString().slice(0, 10)` is wrong for us.
 * A teacher logging a 9pm class in IST (UTC+5:30) would have it filed under
 * tomorrow, because 21:00 IST is 15:30 UTC — fine — but 05:00 IST is 23:30 UTC
 * the previous day. Any UTC round-trip can shift the calendar day. So we read
 * the local Y/M/D off the Date and never let a timezone touch it.
 *
 * The strings sort lexicographically in date order, which is why the rest of
 * the app compares them with `<` and `>` instead of parsing.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" for a Date, read off its LOCAL fields. */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today in the local calendar. */
export function todayISO(): string {
  return toISO(new Date());
}

/**
 * Parse "YYYY-MM-DD" into a local-midnight Date.
 * `new Date("2026-03-01")` parses as UTC midnight; the 3-arg constructor is
 * local, which is what we want.
 */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isISO(value: unknown): value is string {
  return typeof value === "string" && ISO.test(value) && !Number.isNaN(fromISO(value).getTime());
}

/**
 * Move a date by whole days. Month/year rollover and DST are handled by the
 * Date constructor normalising an out-of-range day number.
 */
export function shiftDate(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/**
 * Whole days from `from` to `to`. Positive when `to` is later.
 *   daysBetween(lastTaught, today) -> days since  (a gap)
 *   daysBetween(today, examDate)   -> days until  (a countdown)
 *
 * Uses UTC epoch values of the local Y/M/D so a DST shift in between cannot
 * produce 6.96 days and round to the wrong integer.
 */
export function daysBetween(from: string, to: string): number {
  const a = fromISO(from);
  const b = fromISO(to);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

/** "Tue 12 Aug" — short enough for the date strip, unambiguous in a register. */
export function prettyDate(iso: string): string {
  return fromISO(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "12 Aug 2026" — for exam dates, where the year matters. */
export function prettyDateLong(iso: string): string {
  return fromISO(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
