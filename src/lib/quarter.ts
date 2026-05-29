/**
 * Calendar-quarter helpers for the Belgian student-worker (STU) Dimona engine.
 *
 * Belgian Dimona STU is filed *per calendar quarter* with the planned hours
 * for that quarter, and the 650h student quota resets on January 1. These pure
 * functions centralise the quarter math so the services agree on boundaries.
 */

export interface YearQuarter {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

/** Returns the calendar {year, quarter} a date falls in (UTC). */
export function quarterOf(date: Date): YearQuarter {
  const year = date.getUTCFullYear();
  const quarter = (Math.floor(date.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  return { year, quarter };
}

/**
 * Inclusive-start / exclusive-end UTC range `[start, end)` for a quarter.
 * Q1 → Jan 1 .. Apr 1, Q4 → Oct 1 .. next Jan 1.
 */
export function quarterRange(year: number, quarter: number): {
  start: Date;
  end: Date;
} {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, startMonth + 3, 1, 0, 0, 0, 0));
  return { start, end };
}

/**
 * The Dimona STU planned-hours rounding rule: *every started hour rounds up to
 * a full hour*. A 3h30 shift counts as 4 planned hours. Sub-minute slivers and
 * zero/negative ranges round to 0.
 */
export function ceilShiftHours(startsAt: Date, endsAt: Date): number {
  const ms = endsAt.getTime() - startsAt.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 3_600_000);
}

/** Distinct {year, quarter} keys for a set of dates (stable, deduplicated). */
export function distinctQuarters(dates: Date[]): YearQuarter[] {
  const seen = new Map<string, YearQuarter>();
  for (const d of dates) {
    const yq = quarterOf(d);
    seen.set(`${yq.year}-${yq.quarter}`, yq);
  }
  return [...seen.values()];
}
