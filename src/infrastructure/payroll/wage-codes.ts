/**
 * Deterministic wage-code bucketing for Belgian payroll exports.
 *
 * A single worked time entry can span several pay categories (a 20:00–02:00
 * shift is part evening, part night; a Saturday shift is weekend; anything
 * beyond the daily threshold is overtime). The social secretariat applies the
 * actual premiums, so here we only *split worked minutes into buckets* with a
 * clear, testable precedence — we never compute money for the premium itself.
 *
 * Precedence applied per worked minute (highest first):
 *   1. OVERTIME — minutes beyond the configured daily threshold
 *   2. HOLIDAY  — the calendar day (in the business timezone) is a public holiday
 *   3. WEEKEND  — Saturday or Sunday
 *   4. NIGHT    — within the night window (default 22:00–06:00)
 *   5. REGULAR  — everything else
 *
 * Break handling: the unpaid break is modelled as taken at the *end* of the
 * entry, i.e. the worked minutes are the first `gross - break` minutes of the
 * interval. This keeps the split deterministic and easy to reason about.
 */

export const WAGE_CODES = {
  REGULAR: "REGULAR",
  OVERTIME: "OVERTIME",
  NIGHT: "NIGHT",
  WEEKEND: "WEEKEND",
  HOLIDAY: "HOLIDAY",
  ABSENCE: "ABSENCE",
} as const;

export type WageCode = (typeof WAGE_CODES)[keyof typeof WAGE_CODES];

/** A bucket key maps 1:1 to a (non-absence) wage code. */
export type BucketKey = "regular" | "overtime" | "night" | "weekend" | "holiday";

export type WageBuckets = Record<BucketKey, number>;

export interface BucketConfig {
  /** IANA timezone the wall-clock classification is done in. */
  timeZone: string;
  /** Hour the night window opens (inclusive). Defaults to 22. */
  nightStartHour?: number;
  /** Hour the night window closes (exclusive). Defaults to 6. */
  nightEndHour?: number;
  /**
   * Minutes worked in the entry beyond which time counts as overtime.
   * Defaults to 480 (8h). Pass `0` or a negative value to disable overtime.
   */
  dailyOvertimeThresholdMinutes?: number;
  /** Public-holiday calendar days as `YYYY-MM-DD` strings in `timeZone`. */
  holidays?: ReadonlySet<string>;
}

/** Ordered mapping from bucket key to wage code, for stable row emission. */
export const BUCKET_TO_CODE: ReadonlyArray<[BucketKey, WageCode]> = [
  ["regular", WAGE_CODES.REGULAR],
  ["overtime", WAGE_CODES.OVERTIME],
  ["night", WAGE_CODES.NIGHT],
  ["weekend", WAGE_CODES.WEEKEND],
  ["holiday", WAGE_CODES.HOLIDAY],
];

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

interface WallParts {
  dateStr: string;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

/** Wall-clock parts of an instant in a given timezone. */
export function wallParts(date: Date, timeZone: string): WallParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some platforms emit 24 for midnight
  const minute = Number(get("minute"));
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { dateStr, hour, minute, weekday };
}

/** True when `hour` falls inside the (possibly midnight-wrapping) night window. */
export function isNightHour(hour: number, start: number, end: number): boolean {
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function emptyBuckets(): WageBuckets {
  return { regular: 0, overtime: 0, night: 0, weekend: 0, holiday: 0 };
}

/**
 * Splits the worked time of a single entry into wage-code buckets (in minutes).
 * The sum of the buckets equals the net worked minutes (gross minus break).
 */
export function splitWorkedMinutes(
  clockInAt: Date,
  clockOutAt: Date | null,
  breakMinutes: number,
  config: BucketConfig,
): WageBuckets {
  const buckets = emptyBuckets();
  if (!clockOutAt) return buckets;

  const grossMinutes = Math.max(
    0,
    Math.floor((clockOutAt.getTime() - clockInAt.getTime()) / 60_000),
  );
  const worked = Math.max(0, grossMinutes - Math.max(0, breakMinutes));
  if (worked === 0) return buckets;

  const nightStart = config.nightStartHour ?? 22;
  const nightEnd = config.nightEndHour ?? 6;
  const rawThreshold = config.dailyOvertimeThresholdMinutes ?? 480;
  const overtimeThreshold = rawThreshold > 0 ? rawThreshold : Infinity;
  const holidays = config.holidays ?? new Set<string>();

  let index = 0;
  while (index < worked) {
    const at = new Date(clockInAt.getTime() + index * 60_000);
    const { dateStr, hour, minute, weekday } = wallParts(at, config.timeZone);

    // Category is constant within an hour, so advance to the next hour boundary
    // (or the overtime threshold, whichever comes first) in a single step.
    let runEnd = Math.min(worked, index + (60 - minute));
    if (index < overtimeThreshold && overtimeThreshold < runEnd) {
      runEnd = overtimeThreshold;
    }
    const run = runEnd - index;

    let key: BucketKey;
    if (index >= overtimeThreshold) key = "overtime";
    else if (holidays.has(dateStr)) key = "holiday";
    else if (weekday === 0 || weekday === 6) key = "weekend";
    else if (isNightHour(hour, nightStart, nightEnd)) key = "night";
    else key = "regular";

    buckets[key] += run;
    index = runEnd;
  }

  return buckets;
}
