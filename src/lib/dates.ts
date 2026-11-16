/** All dates in the app are calendar days as "YYYY-MM-DD" strings. */

export function todayInTz(tz: string | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function hourInTz(tz: string | undefined): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date());
    return Number(h);
  } catch {
    return new Date().getUTCHours();
  }
}

export function toMs(date: string): number {
  return Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
}

export function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const DAY = 86_400_000;

export function addDays(date: string, days: number): string {
  return fromMs(toMs(date) + days * DAY);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toMs(a) - toMs(b)) / DAY);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const dow = new Date(toMs(date)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toMs(s));
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts });

const F_SHORT = fmt({ month: "short", day: "numeric" });
const F_LONG = fmt({ weekday: "long", month: "long", day: "numeric" });
const F_FULL = fmt({ month: "short", day: "numeric", year: "numeric" });
const F_MONTH = fmt({ month: "short", year: "numeric" });
const F_WEEKDAY = fmt({ weekday: "short" });

export const formatShort = (d: string) => F_SHORT.format(toMs(d));
export const formatLong = (d: string) => F_LONG.format(toMs(d));
export const formatFull = (d: string) => F_FULL.format(toMs(d));
export const formatMonth = (d: string) => F_MONTH.format(toMs(d));
export const formatWeekday = (d: string) => F_WEEKDAY.format(toMs(d));

export function relativeDay(date: string, today: string): string {
  const d = diffDays(date, today);
  if (d === 0) return "Today";
  if (d === -1) return "Yesterday";
  if (d === 1) return "Tomorrow";
  return formatLong(date);
}

/** "Dec 28 to Apr 10, 2027", "Dec 28, 2026 to Apr 10, 2027", or "Dec 28, 2026 or later". */
export function formatRange(early: string | null, late: string | null): string | null {
  if (!early) return null;
  if (!late) return `${formatFull(early)} or later`;
  if (early === late) return formatFull(early);
  return early.slice(0, 4) === late.slice(0, 4)
    ? `${formatShort(early)} to ${formatFull(late)}`
    : `${formatFull(early)} to ${formatFull(late)}`;
}
