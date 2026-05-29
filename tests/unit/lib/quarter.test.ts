import { describe, expect, it } from "vitest";
import {
  ceilShiftHours,
  distinctQuarters,
  quarterOf,
  quarterRange,
} from "@/lib/quarter";

describe("quarter helpers", () => {
  it("maps a date to its calendar quarter (UTC)", () => {
    expect(quarterOf(new Date("2026-01-15T10:00:00Z"))).toEqual({
      year: 2026,
      quarter: 1,
    });
    expect(quarterOf(new Date("2026-04-01T00:00:00Z"))).toEqual({
      year: 2026,
      quarter: 2,
    });
    expect(quarterOf(new Date("2026-07-31T23:00:00Z"))).toEqual({
      year: 2026,
      quarter: 3,
    });
    expect(quarterOf(new Date("2026-12-31T12:00:00Z"))).toEqual({
      year: 2026,
      quarter: 4,
    });
  });

  it("returns the half-open [start, end) range for a quarter", () => {
    const q3 = quarterRange(2026, 3);
    expect(q3.start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(q3.end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    const q4 = quarterRange(2026, 4);
    expect(q4.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rounds each started hour UP to a whole hour", () => {
    const at = (h: string) => new Date(`2026-06-01T${h}:00Z`);
    expect(ceilShiftHours(at("09:00"), at("12:30"))).toBe(4); // 3h30 -> 4
    expect(ceilShiftHours(at("09:00"), at("13:00"))).toBe(4); // 4h00 -> 4
    expect(ceilShiftHours(at("09:00"), at("09:01"))).toBe(1); // 1 min -> 1
    expect(ceilShiftHours(at("09:00"), at("09:00"))).toBe(0); // zero -> 0
    expect(ceilShiftHours(at("12:00"), at("09:00"))).toBe(0); // negative -> 0
  });

  it("deduplicates quarters across a set of dates", () => {
    const dates = [
      new Date("2026-01-10T00:00:00Z"),
      new Date("2026-02-20T00:00:00Z"), // same Q1
      new Date("2026-08-01T00:00:00Z"), // Q3
    ];
    const result = distinctQuarters(dates);
    expect(result).toEqual([
      { year: 2026, quarter: 1 },
      { year: 2026, quarter: 3 },
    ]);
  });
});
