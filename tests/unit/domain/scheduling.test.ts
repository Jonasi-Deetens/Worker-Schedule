import { describe, expect, it } from "vitest";
import {
  assertNoAssignmentOverlap,
  canApproveSubscription,
  canRejectSubscription,
  canSubscribeToShift,
  canWithdrawSubscription,
  computeShiftDisplayStatus,
  hasTimeOverlap,
  isShiftCapacityAvailable,
  subscriptionToDisplayStatus,
} from "@/domain/rules/scheduling";
import type { SubscriptionStatus, TimeRange } from "@/domain/types";

const range = (start: string, end: string): TimeRange => ({
  startsAt: new Date(start),
  endsAt: new Date(end),
});

describe("hasTimeOverlap", () => {
  it("returns true when ranges overlap", () => {
    expect(
      hasTimeOverlap(
        range("2026-06-01T09:00:00Z", "2026-06-01T13:00:00Z"),
        range("2026-06-01T12:00:00Z", "2026-06-01T17:00:00Z"),
      ),
    ).toBe(true);
  });

  it("returns false when ranges are adjacent but not overlapping", () => {
    expect(
      hasTimeOverlap(
        range("2026-06-01T09:00:00Z", "2026-06-01T13:00:00Z"),
        range("2026-06-01T13:00:00Z", "2026-06-01T17:00:00Z"),
      ),
    ).toBe(false);
  });

  it("returns false when one range is fully before the other", () => {
    expect(
      hasTimeOverlap(
        range("2026-06-01T09:00:00Z", "2026-06-01T11:00:00Z"),
        range("2026-06-01T14:00:00Z", "2026-06-01T17:00:00Z"),
      ),
    ).toBe(false);
  });

  it("returns true when one range fully contains the other", () => {
    expect(
      hasTimeOverlap(
        range("2026-06-01T09:00:00Z", "2026-06-01T17:00:00Z"),
        range("2026-06-01T11:00:00Z", "2026-06-01T13:00:00Z"),
      ),
    ).toBe(true);
  });
});

describe("isShiftCapacityAvailable", () => {
  it.each([
    [0, 1, true],
    [1, 2, true],
    [2, 2, false],
    [3, 2, false],
  ])(
    "returns %s when approved=%i required=%i",
    (approved, required, expected) => {
      expect(isShiftCapacityAvailable(approved, required)).toBe(expected);
    },
  );
});

describe("subscription transitions", () => {
  const statuses: SubscriptionStatus[] = [
    "PENDING",
    "APPROVED",
    "REJECTED",
    "WITHDRAWN",
  ];

  it.each(statuses)(
    "canWithdrawSubscription is true only for PENDING (case %s)",
    (status) => {
      expect(canWithdrawSubscription(status)).toBe(status === "PENDING");
    },
  );

  it.each(statuses)(
    "canApproveSubscription is true only for PENDING (case %s)",
    (status) => {
      expect(canApproveSubscription(status)).toBe(status === "PENDING");
    },
  );

  it.each(statuses)(
    "canRejectSubscription is true only for PENDING (case %s)",
    (status) => {
      expect(canRejectSubscription(status)).toBe(status === "PENDING");
    },
  );
});

describe("assertNoAssignmentOverlap", () => {
  const newShift = range("2026-06-01T09:00:00Z", "2026-06-01T13:00:00Z");

  it("does not throw when no existing assignments", () => {
    expect(() => assertNoAssignmentOverlap(newShift, [])).not.toThrow();
  });

  it("does not throw when only non-overlapping assignments exist", () => {
    expect(() =>
      assertNoAssignmentOverlap(newShift, [
        range("2026-06-01T13:00:00Z", "2026-06-01T17:00:00Z"),
        range("2026-06-02T09:00:00Z", "2026-06-02T13:00:00Z"),
      ]),
    ).not.toThrow();
  });

  it("throws when any existing assignment overlaps the new one", () => {
    expect(() =>
      assertNoAssignmentOverlap(newShift, [
        range("2026-06-01T12:00:00Z", "2026-06-01T17:00:00Z"),
      ]),
    ).toThrow(/overlap/i);
  });
});

describe("computeShiftDisplayStatus", () => {
  it("returns Cancelled when shift is cancelled regardless of counts", () => {
    expect(
      computeShiftDisplayStatus({
        shiftStatus: "CANCELLED",
        approvedCount: 2,
        requiredSpots: 2,
        pendingCount: 1,
      }),
    ).toBe("Cancelled");
  });

  it("returns Approved/Filled when at or above capacity", () => {
    expect(
      computeShiftDisplayStatus({
        shiftStatus: "OPEN",
        approvedCount: 2,
        requiredSpots: 2,
        pendingCount: 1,
      }),
    ).toBe("Approved/Filled");
  });

  it("returns Pending when there are pending applications but not filled", () => {
    expect(
      computeShiftDisplayStatus({
        shiftStatus: "OPEN",
        approvedCount: 0,
        requiredSpots: 2,
        pendingCount: 3,
      }),
    ).toBe("Pending");
  });

  it("returns Open when no pending and not filled", () => {
    expect(
      computeShiftDisplayStatus({
        shiftStatus: "OPEN",
        approvedCount: 0,
        requiredSpots: 2,
        pendingCount: 0,
      }),
    ).toBe("Open");
  });
});

describe("subscriptionToDisplayStatus", () => {
  it.each([
    ["PENDING", "Pending"],
    ["APPROVED", "Approved/Filled"],
    ["REJECTED", "Rejected"],
    ["WITHDRAWN", "Withdrawn"],
  ] as const)("maps %s to %s", (sub, display) => {
    expect(subscriptionToDisplayStatus(sub)).toBe(display);
  });
});

describe("canSubscribeToShift", () => {
  it("allows fresh application to an open shift", () => {
    expect(
      canSubscribeToShift({
        shiftStatus: "OPEN",
        existingSubscriptionStatus: null,
      }),
    ).toBe(true);
  });

  it("blocks application to cancelled or filled shifts", () => {
    expect(
      canSubscribeToShift({
        shiftStatus: "CANCELLED",
        existingSubscriptionStatus: null,
      }),
    ).toBe(false);
    expect(
      canSubscribeToShift({
        shiftStatus: "FILLED",
        existingSubscriptionStatus: null,
      }),
    ).toBe(false);
  });

  it("blocks application when worker already has PENDING or APPROVED subscription", () => {
    expect(
      canSubscribeToShift({
        shiftStatus: "OPEN",
        existingSubscriptionStatus: "PENDING",
      }),
    ).toBe(false);
    expect(
      canSubscribeToShift({
        shiftStatus: "OPEN",
        existingSubscriptionStatus: "APPROVED",
      }),
    ).toBe(false);
  });

  it("allows re-application after a REJECTED or WITHDRAWN subscription", () => {
    expect(
      canSubscribeToShift({
        shiftStatus: "OPEN",
        existingSubscriptionStatus: "REJECTED",
      }),
    ).toBe(true);
    expect(
      canSubscribeToShift({
        shiftStatus: "OPEN",
        existingSubscriptionStatus: "WITHDRAWN",
      }),
    ).toBe(true);
  });
});
