export type UserRole = "OWNER" | "WORKER" | "MANAGER";

export type UserStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export type ContractType = "FLEXI" | "JOBSTUDENT" | "EMPLOYEE" | "EXTRA";

export type ShiftStatus = "OPEN" | "PENDING" | "FILLED" | "CANCELLED";

export type SubscriptionStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";

export type DisplayStatus =
  | "Open"
  | "Pending"
  | "Approved/Filled"
  | "Rejected"
  | "Withdrawn"
  | "Cancelled";

export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

export interface ShiftCapacityInput {
  shiftStatus: ShiftStatus;
  approvedCount: number;
  requiredSpots: number;
  pendingCount: number;
}

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "CAPACITY_EXCEEDED"
      | "OVERLAP"
      | "INVALID_TRANSITION"
      | "NOT_FOUND"
      | "FORBIDDEN",
  ) {
    super(message);
    this.name = "DomainError";
  }
}
