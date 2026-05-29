/**
 * Belgian statutory public holidays.
 *
 * The ten federal public holidays are computed in code so payroll never
 * depends on a hand-maintained table. The four movable feasts (Easter Monday,
 * Ascension, Whit/Pentecost Monday) are derived from Easter Sunday, which is
 * itself computed with the Anonymous Gregorian algorithm (Computus). All dates
 * are returned as plain `YYYY-MM-DD` calendar strings — these are wall-clock
 * calendar days, not instants, so they are timezone-agnostic by construction.
 */

export interface BelgianHoliday {
  /** Calendar day as `YYYY-MM-DD`. */
  date: string;
  /** Stable english identifier / label for the holiday. */
  name: string;
}

/**
 * Easter Sunday for a Gregorian-calendar `year`, via the Anonymous Gregorian
 * algorithm (Meeus/Jones/Butcher). Returns a `{ month, day }` (1-indexed month).
 */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Formats a UTC date as `YYYY-MM-DD`. */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A fixed calendar day in `year` (month is 1-indexed) as `YYYY-MM-DD`. */
function fixed(year: number, month: number, day: number): string {
  return toIsoDate(new Date(Date.UTC(year, month - 1, day)));
}

/** Easter Sunday plus `offsetDays` as `YYYY-MM-DD`. */
function easterOffset(year: number, offsetDays: number): string {
  const easter = easterSunday(year);
  const base = Date.UTC(year, easter.month - 1, easter.day);
  return toIsoDate(new Date(base + offsetDays * 86_400_000));
}

/**
 * The ten Belgian federal public holidays for `year`, ordered chronologically.
 * Movable feasts are computed from Easter Sunday.
 */
export function computeBelgianHolidays(year: number): BelgianHoliday[] {
  const holidays: BelgianHoliday[] = [
    { date: fixed(year, 1, 1), name: "New Year" },
    { date: easterOffset(year, 1), name: "Easter Monday" },
    { date: fixed(year, 5, 1), name: "Labour Day" },
    { date: easterOffset(year, 39), name: "Ascension Day" },
    { date: easterOffset(year, 50), name: "Whit Monday" },
    { date: fixed(year, 7, 21), name: "National Day" },
    { date: fixed(year, 8, 15), name: "Assumption" },
    { date: fixed(year, 11, 1), name: "All Saints" },
    { date: fixed(year, 11, 11), name: "Armistice Day" },
    { date: fixed(year, 12, 25), name: "Christmas" },
  ];
  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/** The set of computed Belgian public-holiday `YYYY-MM-DD` strings for `year`. */
export function belgianHolidaySet(year: number): Set<string> {
  return new Set(computeBelgianHolidays(year).map((h) => h.date));
}
