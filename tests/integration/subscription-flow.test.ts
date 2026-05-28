import { describe, expect, it } from "vitest";
import {
  canApproveSubscription,
  canWithdrawSubscription,
  hasTimeOverlap,
  isShiftCapacityAvailable,
} from "@/domain/rules/scheduling";

describe("subscription flow rules", () => {
  it("prevents double approval when at capacity", () => {
    const approvedCount = 2;
    const requiredSpots = 2;
    expect(canApproveSubscription("PENDING")).toBe(true);
    expect(isShiftCapacityAvailable(approvedCount, requiredSpots)).toBe(false);
  });

  it("prevents overlapping assignments for same worker", () => {
    const existing = {
      startsAt: new Date("2026-06-01T09:00:00Z"),
      endsAt: new Date("2026-06-01T13:00:00Z"),
    };
    const newShift = {
      startsAt: new Date("2026-06-01T12:00:00Z"),
      endsAt: new Date("2026-06-01T17:00:00Z"),
    };
    expect(hasTimeOverlap(existing, newShift)).toBe(true);
  });

  it("allows withdrawal only when pending", () => {
    expect(canWithdrawSubscription("PENDING")).toBe(true);
    expect(canWithdrawSubscription("APPROVED")).toBe(false);
  });
});
