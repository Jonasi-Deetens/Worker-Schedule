/**
 * Single source of truth for week-boundary math, honouring a business's
 * `weekStartsOn` (0 = Sunday … 6 = Saturday) and IANA `timeZone`.
 *
 * Previously week starts were computed ad-hoc in several places (analytics used
 * server-local `getDay()`, `/me/hours` hard-coded local Monday, payroll sliced
 * UTC strings), which disagreed for users/businesses outside the server's
 * timezone and around DST transitions. Everything funnels through here now.
 *
 * Implementation notes:
 *  - We resolve the calendar date *in the target timezone* with `Intl`
 *    (no heavy date library), then represent the resulting week-start day as a
 *    UTC-midnight `Date`. Bucket keys are the `YYYY-MM-DD` of that day.
 *  - Anchoring on UTC midnight means stepping forward a week is a plain
 *    `+7 * 86_400_000` with no DST drift, while the *calendar date* itself was
 *    derived in the business timezone — so the boundary lands on the correct
 *    local day even across spring-forward / fall-back.
 */

export const DEFAULT_TIME_ZONE = "UTC";
export const DEFAULT_WEEK_STARTS_ON = 1;

const WEEK_MS = 7 * 86_400_000;

interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

function calendarDateInTimeZone(date: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
  };
}

/**
 * Start of the week containing `date`, evaluated in `timeZone`, returned as the
 * UTC-midnight `Date` of the week-start calendar day.
 */
export function startOfWeek(
  date: Date,
  weekStartsOn: number = DEFAULT_WEEK_STARTS_ON,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const { year, month, day } = calendarDateInTimeZone(date, timeZone);
  // Day-of-week of a calendar date is timezone-independent once the date is
  // fixed, so we can read it off a UTC anchor.
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const normalizedStart = ((weekStartsOn % 7) + 7) % 7;
  const diff = (dow - normalizedStart + 7) % 7;
  return new Date(Date.UTC(year, month - 1, day - diff));
}

/** `YYYY-MM-DD` key of the week start — used as a stable bucket identifier. */
export function weekKey(
  date: Date,
  weekStartsOn: number = DEFAULT_WEEK_STARTS_ON,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  return startOfWeek(date, weekStartsOn, timeZone).toISOString().slice(0, 10);
}

/** Adds `weeks` whole weeks to a UTC-anchored week-start date (DST-safe). */
export function addWeeks(weekStart: Date, weeks: number): Date {
  return new Date(weekStart.getTime() + weeks * WEEK_MS);
}

/** The browser's IANA timezone, falling back to UTC when unavailable. */
export function resolveLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}
