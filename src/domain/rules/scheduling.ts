import type {
  DisplayStatus,
  ShiftCapacityInput,
  ShiftStatus,
  SubscriptionStatus,
  TimeRange,
} from "../types";

export function hasTimeOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export function isShiftCapacityAvailable(
  approvedCount: number,
  requiredSpots: number,
): boolean {
  return approvedCount < requiredSpots;
}

export function canWithdrawSubscription(
  status: SubscriptionStatus,
): boolean {
  return status === "PENDING";
}

export function canApproveSubscription(status: SubscriptionStatus): boolean {
  return status === "PENDING";
}

export function canRejectSubscription(status: SubscriptionStatus): boolean {
  return status === "PENDING";
}

export function assertNoAssignmentOverlap(
  newShift: TimeRange,
  existingAssignments: TimeRange[],
): void {
  const overlaps = existingAssignments.some((existing) =>
    hasTimeOverlap(newShift, existing),
  );
  if (overlaps) {
    throw new Error("Worker already has an overlapping approved assignment");
  }
}

/**
 * Whether a worker can submit a new application to a shift.
 *
 * Workers may apply when the shift is not cancelled or already filled and they
 * do not already hold an active (PENDING or APPROVED) subscription for it.
 * REJECTED and WITHDRAWN subscriptions allow re-applying.
 */
export function canSubscribeToShift(input: {
  shiftStatus: ShiftStatus;
  existingSubscriptionStatus?: SubscriptionStatus | null;
}): boolean {
  if (input.shiftStatus === "CANCELLED" || input.shiftStatus === "FILLED") {
    return false;
  }
  const existing = input.existingSubscriptionStatus;
  if (existing === "PENDING" || existing === "APPROVED") {
    return false;
  }
  return true;
}

export function computeShiftDisplayStatus(
  input: ShiftCapacityInput,
): DisplayStatus {
  if (input.shiftStatus === "CANCELLED") {
    return "Cancelled";
  }
  if (input.approvedCount >= input.requiredSpots) {
    return "Approved/Filled";
  }
  if (input.pendingCount > 0) {
    return "Pending";
  }
  return "Open";
}

export function subscriptionToDisplayStatus(
  status: SubscriptionStatus,
): DisplayStatus {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "APPROVED":
      return "Approved/Filled";
    case "REJECTED":
      return "Rejected";
    case "WITHDRAWN":
      return "Withdrawn";
  }
}
