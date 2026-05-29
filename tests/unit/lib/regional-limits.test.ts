import { describe, expect, it } from "vitest";
import { computeRegionalAdvisory } from "@/lib/regional-limits";

const hours = (quarterHours: number[], monthHours: number[] = []) => ({
  quarterHours,
  monthHours: monthHours.length ? monthHours : Array.from({ length: 12 }, () => 0),
});

describe("computeRegionalAdvisory", () => {
  it("Brussels caps 240h per quarter and flags excess", () => {
    const result = computeRegionalAdvisory("BRUSSELS", hours([100, 260, 0, 0]));
    expect(result.limitType).toBe("quarter");
    expect(result.limitHours).toBe(240);
    expect(result.periods[0]).toMatchObject({ label: "Q1", hours: 100, exceeded: false });
    expect(result.periods[1]).toMatchObject({ label: "Q2", hours: 260, exceeded: true });
  });

  it("Wallonia uses a 240h per-quarter indicator", () => {
    const result = computeRegionalAdvisory("WALLONIA", hours([0, 0, 240, 0]));
    expect(result.limitType).toBe("quarter");
    expect(result.limitHours).toBe(240);
    expect(result.periods[2]).toMatchObject({ hours: 240, exceeded: false });
  });

  it("Flanders uses an 80h per-month indicator", () => {
    const monthHours = Array.from({ length: 12 }, () => 0);
    monthHours[2] = 90; // March over the 80h advisory
    const result = computeRegionalAdvisory("FLANDERS", hours([0, 0, 0, 0], monthHours));
    expect(result.limitType).toBe("month");
    expect(result.limitHours).toBe(80);
    expect(result.periods[2]).toMatchObject({ label: "3", hours: 90, exceeded: true });
  });

  it("East Belgium has no annual cap", () => {
    const result = computeRegionalAdvisory("EAST_BELGIUM", hours([300, 300, 300, 300]));
    expect(result.limitType).toBe("none");
    expect(result.periods).toEqual([]);
  });
});
