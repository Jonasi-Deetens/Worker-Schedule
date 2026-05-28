import { describe, expect, it } from "vitest";
import { formatDuration } from "../../../src/lib/format-duration";

describe("formatDuration", () => {
  it("formats zero", () => {
    expect(formatDuration(0)).toBe("0h 00m");
  });

  it("formats sub-hour durations with zero-padded minutes", () => {
    expect(formatDuration(20)).toBe("0h 20m");
    expect(formatDuration(48)).toBe("0h 48m");
  });

  it("formats exact hours", () => {
    expect(formatDuration(60)).toBe("1h 00m");
    expect(formatDuration(120)).toBe("2h 00m");
  });

  it("formats the gross/net/break example trio", () => {
    expect(formatDuration(68)).toBe("1h 08m");
    expect(formatDuration(48)).toBe("0h 48m");
    expect(formatDuration(20)).toBe("0h 20m");
  });

  it("rounds fractional minutes and clamps negatives", () => {
    expect(formatDuration(68.4)).toBe("1h 08m");
    expect(formatDuration(-5)).toBe("0h 00m");
  });
});
