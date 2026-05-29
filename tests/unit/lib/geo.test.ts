import { describe, expect, it } from "vitest";
import { haversineMeters, isWithinRadius } from "@/lib/geo";

describe("geo", () => {
  it("returns ~0 for identical points", () => {
    const p = { lat: 50.8503, lng: 4.3517 };
    expect(haversineMeters(p, p)).toBeLessThan(0.001);
  });

  it("computes a known short distance within tolerance", () => {
    // ~111m apart along latitude (0.001 deg ≈ 111m).
    const d = haversineMeters(
      { lat: 50.85, lng: 4.35 },
      { lat: 50.851, lng: 4.35 },
    );
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it("isWithinRadius accepts near points and rejects far ones", () => {
    const center = { lat: 50.85, lng: 4.35 };
    expect(isWithinRadius(center, { lat: 50.8501, lng: 4.3501 }, 100)).toBe(true);
    expect(isWithinRadius(center, { lat: 51.0, lng: 4.35 }, 100)).toBe(false);
  });
});
