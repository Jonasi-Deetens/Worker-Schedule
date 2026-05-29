import { describe, expect, it } from "vitest";
import {
  isNightHour,
  splitWorkedMinutes,
  WAGE_CODES,
} from "@/infrastructure/payroll/wage-codes";
import { belgianHolidaySet } from "@/lib/belgian-holidays";

// Tests use the UTC timezone so wall-clock classification is deterministic and
// free of DST edges (UTC hour === wall hour).
const TZ = "UTC";

function total(buckets: Record<string, number>): number {
  return Object.values(buckets).reduce((a, b) => a + b, 0);
}

describe("isNightHour", () => {
  it("handles a midnight-wrapping window (22:00–06:00)", () => {
    expect(isNightHour(23, 22, 6)).toBe(true);
    expect(isNightHour(3, 22, 6)).toBe(true);
    expect(isNightHour(6, 22, 6)).toBe(false);
    expect(isNightHour(12, 22, 6)).toBe(false);
  });
});

describe("splitWorkedMinutes", () => {
  it("classifies a plain weekday day shift as regular", () => {
    const buckets = splitWorkedMinutes(
      new Date("2026-01-05T09:00:00Z"), // Monday
      new Date("2026-01-05T17:00:00Z"),
      0,
      { timeZone: TZ },
    );
    expect(buckets.regular).toBe(480);
    expect(buckets.overtime).toBe(0);
    expect(total(buckets)).toBe(480);
  });

  it("splits hours beyond the daily threshold into overtime", () => {
    const buckets = splitWorkedMinutes(
      new Date("2026-01-05T09:00:00Z"),
      new Date("2026-01-05T19:00:00Z"), // 10h
      0,
      { timeZone: TZ, dailyOvertimeThresholdMinutes: 480 },
    );
    expect(buckets.regular).toBe(480);
    expect(buckets.overtime).toBe(120);
  });

  it("splits the night window out of an evening shift", () => {
    const buckets = splitWorkedMinutes(
      new Date("2026-01-05T21:00:00Z"),
      new Date("2026-01-05T23:30:00Z"),
      0,
      { timeZone: TZ },
    );
    expect(buckets.regular).toBe(60); // 21:00–22:00
    expect(buckets.night).toBe(90); // 22:00–23:30
  });

  it("classifies a Saturday shift as weekend regardless of daytime", () => {
    const buckets = splitWorkedMinutes(
      new Date("2026-01-10T10:00:00Z"), // Saturday
      new Date("2026-01-10T14:00:00Z"),
      0,
      { timeZone: TZ },
    );
    expect(buckets.weekend).toBe(240);
    expect(buckets.regular).toBe(0);
  });

  it("gives holidays precedence over weekend and night", () => {
    const buckets = splitWorkedMinutes(
      new Date("2026-01-05T09:00:00Z"),
      new Date("2026-01-05T13:00:00Z"),
      0,
      { timeZone: TZ, holidays: new Set(["2026-01-05"]) },
    );
    expect(buckets.holiday).toBe(240);
    expect(buckets.regular).toBe(0);
  });

  it("classifies a shift on a computed Belgian holiday into the HOLIDAY bucket", () => {
    // Christmas 2025 (Thursday) — a statutory Belgian holiday.
    const buckets = splitWorkedMinutes(
      new Date("2025-12-25T09:00:00Z"),
      new Date("2025-12-25T13:00:00Z"),
      0,
      { timeZone: TZ, holidays: belgianHolidaySet(2025) },
    );
    expect(buckets.holiday).toBe(240);
    expect(buckets.regular).toBe(0);
  });

  it("splits a midnight-crossing shift across regular and night", () => {
    const buckets = splitWorkedMinutes(
      new Date("2026-01-05T20:00:00Z"),
      new Date("2026-01-06T02:00:00Z"), // 6h
      0,
      { timeZone: TZ },
    );
    expect(buckets.regular).toBe(120); // 20:00–22:00
    expect(buckets.night).toBe(240); // 22:00–02:00
    expect(total(buckets)).toBe(360);
  });

  it("deducts the break from the end of the entry", () => {
    const buckets = splitWorkedMinutes(
      new Date("2026-01-05T09:00:00Z"),
      new Date("2026-01-05T17:00:00Z"),
      60,
      { timeZone: TZ },
    );
    expect(total(buckets)).toBe(420);
    expect(buckets.regular).toBe(420);
  });

  it("returns empty buckets for an open (no clock-out) entry", () => {
    const buckets = splitWorkedMinutes(
      new Date("2026-01-05T09:00:00Z"),
      null,
      0,
      { timeZone: TZ },
    );
    expect(total(buckets)).toBe(0);
  });

  it("maps buckets to the documented wage codes", () => {
    expect(WAGE_CODES.REGULAR).toBe("REGULAR");
    expect(WAGE_CODES.OVERTIME).toBe("OVERTIME");
    expect(WAGE_CODES.NIGHT).toBe("NIGHT");
    expect(WAGE_CODES.WEEKEND).toBe("WEEKEND");
    expect(WAGE_CODES.HOLIDAY).toBe("HOLIDAY");
  });
});
