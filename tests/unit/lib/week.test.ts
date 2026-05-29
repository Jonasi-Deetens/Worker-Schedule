import { describe, expect, it } from "vitest";
import { addWeeks, startOfWeek, weekKey } from "@/lib/week";

describe("weekKey", () => {
  it("returns the Monday for a Monday-start week (UTC)", () => {
    // 2026-05-27 is a Wednesday.
    expect(weekKey(new Date("2026-05-27T10:00:00Z"), 1, "UTC")).toBe(
      "2026-05-25",
    );
  });

  it("returns the Sunday for a Sunday-start week (UTC)", () => {
    expect(weekKey(new Date("2026-05-27T10:00:00Z"), 0, "UTC")).toBe(
      "2026-05-24",
    );
  });

  it("treats a Monday as its own week start", () => {
    expect(weekKey(new Date("2026-05-25T00:00:00Z"), 1, "UTC")).toBe(
      "2026-05-25",
    );
  });

  it("honours the business timezone when the instant crosses a UTC day boundary", () => {
    // 2026-05-04T02:00:00Z is Monday in UTC, but Sunday 22:00 in New York
    // (UTC-4 in DST) — so the New York week starts the previous Monday.
    const instant = new Date("2026-05-04T02:00:00Z");
    expect(weekKey(instant, 1, "UTC")).toBe("2026-05-04");
    expect(weekKey(instant, 1, "America/New_York")).toBe("2026-04-27");
  });

  it("is stable across the spring-forward DST transition (Europe/Brussels)", () => {
    // Brussels springs forward on 2026-03-29 (a Sunday). An instant that
    // Sunday morning must still bucket into the Monday 2026-03-23 week.
    expect(
      weekKey(new Date("2026-03-29T01:00:00Z"), 1, "Europe/Brussels"),
    ).toBe("2026-03-23");
  });

  it("is stable across the fall-back DST transition (Europe/Brussels)", () => {
    // Fall back happens 2026-10-25 (Sunday). Monday-start week = 2026-10-19.
    expect(
      weekKey(new Date("2026-10-25T01:30:00Z"), 1, "Europe/Brussels"),
    ).toBe("2026-10-19");
  });
});

describe("startOfWeek / addWeeks", () => {
  it("anchors the week start at UTC midnight", () => {
    const start = startOfWeek(new Date("2026-05-27T10:00:00Z"), 1, "UTC");
    expect(start.toISOString()).toBe("2026-05-25T00:00:00.000Z");
  });

  it("steps forward whole weeks without DST drift", () => {
    const start = startOfWeek(new Date("2026-03-23T00:00:00Z"), 1, "Europe/Brussels");
    const next = addWeeks(start, 1);
    // Exactly 7 * 24h later, still UTC midnight, lands on the next Monday.
    expect(next.toISOString()).toBe("2026-03-30T00:00:00.000Z");
  });

  it("normalizes out-of-range weekStartsOn values", () => {
    // 7 should behave like 0 (Sunday).
    expect(weekKey(new Date("2026-05-27T10:00:00Z"), 7, "UTC")).toBe(
      weekKey(new Date("2026-05-27T10:00:00Z"), 0, "UTC"),
    );
  });
});
