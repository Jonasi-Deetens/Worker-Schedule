import type { PrismaClient } from "@prisma/client";
import { assertNoAssignmentOverlap } from "@/domain/rules/scheduling";
import type { TimeRange } from "@/domain/types";
import { logger } from "@/infrastructure/logging/logger";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { DimonaService } from "./dimona-service";

export interface ShiftConflictWarning {
  userId: string;
  userName: string;
  conflictingShiftId: string;
  conflictingRange: TimeRange;
}

/**
 * Owns the *assignment-time* logic for a shift — both the owner-initiated
 * direct assign and the soft conflict check the UI runs before persisting a
 * reschedule. Kept separate from `ShiftService` (lifecycle) so transactions
 * here cannot accidentally couple with create/update/delete code paths.
 */
export class ShiftAssignmentService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Owner directly assigns a worker to a shift, bypassing the apply/approve
   * flow. Respects capacity, overlap, and approved time-off. If the shift had
   * a pending subscription for this worker, it is upgraded to APPROVED instead
   * of creating duplicates.
   */
  async assignWorker(input: {
    shiftId: string;
    workerId: string;
    businessId: string;
    ownerId: string;
  }) {
    const shift = await this.db.shift.findFirst({
      where: { id: input.shiftId, businessId: input.businessId },
      include: { assignments: true },
    });
    if (!shift) throw new Error("Shift not found");
    if (shift.status === "CANCELLED") {
      throw new Error("Cannot assign to a cancelled shift");
    }
    if (shift.assignments.length >= shift.requiredSpots) {
      throw new Error("Shift already at capacity");
    }
    if (shift.assignments.some((a) => a.userId === input.workerId)) {
      throw new Error("Worker already assigned");
    }

    const worker = await this.db.user.findFirst({
      where: { id: input.workerId, businessId: input.businessId },
    });
    if (!worker) throw new Error("Worker not found in this business");
    if (worker.status !== "ACTIVE") {
      throw new Error("Worker is not active");
    }

    const overlapping = await this.db.shiftAssignment.findFirst({
      where: {
        userId: input.workerId,
        shiftId: { not: input.shiftId },
        shift: { startsAt: { lt: shift.endsAt }, endsAt: { gt: shift.startsAt } },
      },
    });
    if (overlapping) {
      throw new Error("Worker has an overlapping approved shift");
    }

    const timeOff = await this.db.timeOffRequest.findFirst({
      where: {
        userId: input.workerId,
        status: "APPROVED",
        startsAt: { lt: shift.endsAt },
        endsAt: { gt: shift.startsAt },
      },
    });
    if (timeOff) throw new Error("Worker has approved time-off in this range");

    const existingSub = await this.db.shiftSubscription.findUnique({
      where: { shiftId_userId: { shiftId: input.shiftId, userId: input.workerId } },
    });

    const [assignment] = await this.db.$transaction([
      this.db.shiftAssignment.create({
        data: { shiftId: input.shiftId, userId: input.workerId },
      }),
      existingSub
        ? this.db.shiftSubscription.update({
            where: { id: existingSub.id },
            data: { status: "APPROVED" },
          })
        : this.db.shiftSubscription.create({
            data: {
              shiftId: input.shiftId,
              userId: input.workerId,
              status: "APPROVED",
            },
          }),
    ]);

    await this.db.notification.create({
      data: {
        userId: input.workerId,
        type: "SHIFT_ASSIGNED",
        title: "You were assigned a shift",
        body: `${shift.roleLabel} on ${shift.startsAt.toISOString().slice(0, 10)}`,
        payload: { shiftId: shift.id },
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_ASSIGNED",
        entityType: "Shift",
        entityId: shift.id,
        metadata: { workerId: input.workerId },
      },
    });

    logger.info({
      event: "shift.assignedDirectly",
      shiftId: shift.id,
      workerId: input.workerId,
    });
    publishEvent(input.businessId, {
      type: "assignment.changed",
      shiftId: shift.id,
    });

    if (DimonaService.shouldAutoDeclare(worker.contractType)) {
      const dimona = new DimonaService(this.db);
      await dimona
        .declareIn({ shiftId: shift.id, workerId: input.workerId })
        .catch((err) =>
          logger.warn({
            event: "dimona.declare.failed",
            shiftId: shift.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
    }

    return assignment;
  }

  /**
   * Returns workers already approved on this shift that would now conflict
   * with the new time range. Surfaces a soft warning the UI can show before
   * committing the move.
   */
  async findRescheduleConflicts(input: {
    id: string;
    businessId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<ShiftConflictWarning[]> {
    const shift = await this.db.shift.findFirst({
      where: { id: input.id, businessId: input.businessId },
      include: {
        assignments: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!shift) {
      throw new Error("Shift not found");
    }

    const warnings: ShiftConflictWarning[] = [];
    for (const assignment of shift.assignments) {
      const otherAssignments = await this.db.shiftAssignment.findMany({
        where: {
          userId: assignment.userId,
          shiftId: { not: input.id },
        },
        include: { shift: true },
      });

      try {
        assertNoAssignmentOverlap(
          { startsAt: input.startsAt, endsAt: input.endsAt },
          otherAssignments.map((a) => ({
            startsAt: a.shift.startsAt,
            endsAt: a.shift.endsAt,
          })),
        );
      } catch {
        const conflicting = otherAssignments.find(
          (a) =>
            a.shift.startsAt < input.endsAt && a.shift.endsAt > input.startsAt,
        );
        if (conflicting) {
          warnings.push({
            userId: assignment.userId,
            userName: assignment.user.name,
            conflictingShiftId: conflicting.shiftId,
            conflictingRange: {
              startsAt: conflicting.shift.startsAt,
              endsAt: conflicting.shift.endsAt,
            },
          });
        }
      }
    }

    return warnings;
  }
}
