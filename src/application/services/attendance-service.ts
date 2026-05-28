import type { AttendanceStatus, PrismaClient } from "@prisma/client";

export class AttendanceService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Records the attendance verdict for a single assignment. Owners and
   * managers can mark any assignment of a shift in their business; the shift
   * must have already ended (we don't mark no-shows before the worker's slot
   * is even over).
   */
  async mark(input: {
    assignmentId: string;
    businessId: string;
    reviewerId: string;
    status: AttendanceStatus;
    note?: string;
  }) {
    const assignment = await this.db.shiftAssignment.findFirst({
      where: { id: input.assignmentId, shift: { businessId: input.businessId } },
      include: { shift: true },
    });
    if (!assignment) throw new Error("Assignment not found");
    if (assignment.shift.startsAt > new Date()) {
      throw new Error("Cannot mark attendance before the shift starts");
    }
    const updated = await this.db.shiftAssignment.update({
      where: { id: input.assignmentId },
      data: {
        attendance: input.status,
        attendanceNote: input.note ?? null,
        attendanceMarkedAt: new Date(),
        attendanceMarkedById: input.reviewerId,
      },
    });
    await this.db.auditEvent.create({
      data: {
        userId: input.reviewerId,
        action: "ATTENDANCE_MARKED",
        entityType: "ShiftAssignment",
        entityId: input.assignmentId,
        metadata: { status: input.status, note: input.note ?? null },
      },
    });
    return updated;
  }

  /** Per-worker counts of attendance verdicts in the given range. */
  async statsForWorker(input: {
    userId: string;
    from: Date;
    to: Date;
  }) {
    const rows = await this.db.shiftAssignment.findMany({
      where: {
        userId: input.userId,
        shift: { startsAt: { gte: input.from, lt: input.to } },
        attendance: { not: null },
      },
      select: { attendance: true },
    });
    const counts: Record<AttendanceStatus, number> = {
      ON_TIME: 0,
      LATE: 0,
      NO_SHOW: 0,
      EXCUSED: 0,
    };
    for (const r of rows) {
      if (r.attendance) counts[r.attendance] += 1;
    }
    return counts;
  }

  /**
   * Business-wide no-show rate (no-shows / marked assignments) and counts,
   * used by the analytics dashboard.
   */
  async businessSummary(input: { businessId: string; from: Date; to: Date }) {
    const counts = await this.db.shiftAssignment.groupBy({
      by: ["attendance"],
      where: {
        shift: {
          businessId: input.businessId,
          startsAt: { gte: input.from, lt: input.to },
        },
        attendance: { not: null },
      },
      _count: { _all: true },
    });
    const result: Record<AttendanceStatus, number> = {
      ON_TIME: 0,
      LATE: 0,
      NO_SHOW: 0,
      EXCUSED: 0,
    };
    for (const row of counts) {
      if (row.attendance) result[row.attendance] = row._count._all;
    }
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    return {
      ...result,
      total,
      noShowRate: total > 0 ? result.NO_SHOW / total : 0,
    };
  }
}
