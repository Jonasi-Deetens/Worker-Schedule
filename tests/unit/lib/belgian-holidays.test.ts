import { describe, expect, it } from "vitest";
import {
  belgianHolidaySet,
  computeBelgianHolidays,
  easterSunday,
} from "@/lib/belgian-holidays";

describe("belgian-holidays", () => {
  it("computes Easter Sunday for known years", () => {
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 });
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 });
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
  });

  it("derives the 2025 movable feasts from Easter", () => {
    const byName = new Map(
      computeBelgianHolidays(2025).map((h) => [h.name, h.date]),
    );
    // Easter Sunday 2025 = 2025-04-20.
    expect(byName.get("Easter Monday")).toBe("2025-04-21");
    expect(byName.get("Ascension Day")).toBe("2025-05-29");
    expect(byName.get("Whit Monday")).toBe("2025-06-09");
  });

  it("returns the ten fixed + movable holidays for 2025", () => {
    const dates = computeBelgianHolidays(2025).map((h) => h.date);
    expect(dates).toEqual([
      "2025-01-01",
      "2025-04-21",
      "2025-05-01",
      "2025-05-29",
      "2025-06-09",
      "2025-07-21",
      "2025-08-15",
      "2025-11-01",
      "2025-11-11",
      "2025-12-25",
    ]);
  });

  it("computes the 2024 movable feasts (different Easter)", () => {
    const byName = new Map(
      computeBelgianHolidays(2024).map((h) => [h.name, h.date]),
    );
    // Easter Sunday 2024 = 2024-03-31.
    expect(byName.get("Easter Monday")).toBe("2024-04-01");
    expect(byName.get("Ascension Day")).toBe("2024-05-09");
    expect(byName.get("Whit Monday")).toBe("2024-05-20");
  });

  it("exposes a lookup set of YYYY-MM-DD strings", () => {
    const set = belgianHolidaySet(2025);
    expect(set.has("2025-12-25")).toBe(true);
    expect(set.has("2025-04-21")).toBe(true);
    expect(set.has("2025-04-20")).toBe(false);
  });
});
