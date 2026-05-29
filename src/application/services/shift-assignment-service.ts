import type { PrismaClient } from "@prisma/client";
import { assertNoAssignmentOverlap } from "@/domain/rules/scheduling";
import type { TimeRange } from "@/domain/types";
import { logger } from "@/infrastructure/logging/logger";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { DimonaService } from "./dimona-service";
import { NotificationService } from "./notification-service";
import { SchedulingRules } from "./scheduling-rules";

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
  private readonly notifications: NotificationService;
  private readonly rules: SchedulingRules;

  constructor(private readonly db: PrismaClient) {
    this.notifications = new NotificationService(db);
    this.rules = new SchedulingRules(db);
  }

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
    // Only CONFIRMED assignments occupy a spot (mirrors the read model and the
    // approve/broadcast paths) — workers in PENDING_RECONFIRMATION don't count.
    const confirmedCount = shift.assignments.filter(
      (a) => a.status === "CONFIRMED",
    ).length;
    if (confirmedCount >= shift.requiredSpots) {
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

    // Enforce the shift's required skill on the direct-assign path too — the
    // apply/broadcast paths already filter on it, but a manager assigning
    // directly could otherwise bypass the requirement.
    if (shift.requiredSkillId) {
      const hasSkill = await this.db.userSkill.findFirst({
        where: { userId: input.workerId, skillId: shift.requiredSkillId },
      });
      if (!hasSkill) {
        throw new Error("Worker does not have the required skill");
      }
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

    // Centralised scheduling-rule enforcement (min rest, weekly cap, age,
    // time-off) — identical guard used by approve/broadcast/swap.
    await this.rules.assertAssignable(input.workerId, {
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
    });

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
   * Owner/manager removes a worker from a shift. Drops the assignment and the
   * mirrored subscription, notifies the worker, cancels any Dimona declaration
   * for auto-declare contracts, and re-opens the shift if it was FILLED.
   */
  async unassignWorker(input: {
    shiftId: string;
    workerId: string;
    businessId: string;
    ownerId: string;
  }) {
    const shift = await this.db.shift.findFirst({
      where: { id: input.shiftId, businessId: input.businessId },
    });
    if (!shift) throw new Error("Shift not found");

    const assignment = await this.db.shiftAssignment.findUnique({
      where: {
        shiftId_userId: { shiftId: input.shiftId, userId: input.workerId },
      },
    });
    if (!assignment) throw new Error("Assignment not found");

    const worker = await this.db.user.findUnique({
      where: { id: input.workerId },
      select: { contractType: true },
    });

    await this.db.shiftAssignment.delete({ where: { id: assignment.id } });
    await this.db.shiftSubscription.updateMany({
      where: { shiftId: input.shiftId, userId: input.workerId },
      data: { status: "WITHDRAWN" },
    });

    // A removed worker frees a spot — a FILLED shift becomes OPEN again.
    if (shift.status === "FILLED") {
      await this.db.shift.update({
        where: { id: shift.id },
        data: { status: "OPEN" },
      });
    }

    await this.db.notification.create({
      data: {
        userId: input.workerId,
        type: "SHIFT_CANCELLED",
        title: "You were removed from a shift",
        body: `${shift.roleLabel} on ${shift.startsAt.toISOString().slice(0, 10)}`,
        payload: { shiftId: shift.id },
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_UPDATED",
        entityType: "Shift",
        entityId: shift.id,
        metadata: { unassignedWorkerId: input.workerId },
      },
    });

    if (DimonaService.shouldAutoDeclare(worker?.contractType)) {
      await new DimonaService(this.db)
        .cancel({ shiftId: input.shiftId, workerId: input.workerId })
        .catch((err) =>
          logger.warn({
            event: "dimona.cancel.failed",
            shiftId: input.shiftId,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
    }

    publishEvent(input.businessId, {
      type: "assignment.changed",
      shiftId: shift.id,
    });

    return { success: true };
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

  /**
   * Worker-facing list of shifts they are currently expected to reconfirm
   * after a reschedule. Mirrors `BroadcastService.listForUser` in shape so the
   * worker surfaces can render reconfirm cards exactly like broadcast cards.
   */
  async listPendingReconfirmations(input: {
    userId: string;
    businessId: string;
  }) {
    const assignments = await this.db.shiftAssignment.findMany({
      where: {
        userId: input.userId,
        status: "PENDING_RECONFIRMATION",
        shift: {
          businessId: input.businessId,
          endsAt: { gt: new Date() },
          status: { not: "CANCELLED" },
        },
      },
      include: { shift: true },
      orderBy: { shift: { startsAt: "asc" } },
    });

    return assignments.map((a) => ({
      id: a.shift.id,
      startsAt: a.shift.startsAt,
      endsAt: a.shift.endsAt,
      roleLabel: a.shift.roleLabel,
    }));
  }

  /**
   * Worker re-locks their spot on a rescheduled shift. Mirrors the safety of
   * `BroadcastService.accept`: the shift must be live, the assignment must be
   * in PENDING_RECONFIRMATION, and the *new* time must not clash with the
   * worker's other assignments or approved time-off.
   */
  async confirmReschedule(input: {
    shiftId: string;
    userId: string;
    businessId: string;
  }) {
    const shift = await this.db.shift.findFirst({
      where: { id: input.shiftId, businessId: input.businessId },
    });
    if (!shift) throw new Error("Shift not found");
    if (shift.status === "CANCELLED") throw new Error("Shift is cancelled");
    if (shift.endsAt < new Date()) throw new Error("Shift already ended");

    const assignment = await this.db.shiftAssignment.findUnique({
      where: {
        shiftId_userId: { shiftId: input.shiftId, userId: input.userId },
      },
    });
    if (!assignment || assignment.status !== "PENDING_RECONFIRMATION") {
      throw new Error("This shift does not need reconfirmation");
    }

    const overlap = await this.db.shiftAssignment.findFirst({
      where: {
        userId: input.userId,
        shiftId: { not: input.shiftId },
        shift: { startsAt: { lt: shift.endsAt }, endsAt: { gt: shift.startsAt } },
      },
    });
    if (overlap) {
      throw new Error(
        "The new time overlaps another shift — decline this one instead",
      );
    }

    const timeOff = await this.db.timeOffRequest.findFirst({
      where: {
        userId: input.userId,
        status: "APPROVED",
        startsAt: { lt: shift.endsAt },
        endsAt: { gt: shift.startsAt },
      },
    });
    if (timeOff) {
      throw new Error(
        "You have approved time-off at the new time — decline this one instead",
      );
    }

    const updated = await this.db.shiftAssignment.update({
      where: { id: assignment.id },
      data: { status: "CONFIRMED" },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: "SHIFT_RECONFIRMED",
        entityType: "Shift",
        entityId: shift.id,
      },
    });

    logger.info({
      event: "shift.reschedule.reconfirmed",
      shiftId: shift.id,
      userId: input.userId,
    });
    publishEvent(input.businessId, {
      type: "assignment.changed",
      shiftId: shift.id,
    });

    return updated;
  }

  /**
   * Worker can't make the rescheduled shift: drop the assignment, withdraw the
   * mirrored subscription, and notify the owner so they can re-broadcast the
   * now-open spot.
   */
  async declineReschedule(input: {
    shiftId: string;
    userId: string;
    businessId: string;
  }) {
    const shift = await this.db.shift.findFirst({
      where: { id: input.shiftId, businessId: input.businessId },
    });
    if (!shift) throw new Error("Shift not found");

    const assignment = await this.db.shiftAssignment.findUnique({
      where: {
        shiftId_userId: { shiftId: input.shiftId, userId: input.userId },
      },
    });
    if (!assignment || assignment.status !== "PENDING_RECONFIRMATION") {
      throw new Error("This shift does not need reconfirmation");
    }

    const worker = await this.db.user.findUnique({
      where: { id: input.userId },
      select: { name: true, contractType: true },
    });

    await this.db.shiftAssignment.delete({ where: { id: assignment.id } });
    await this.db.shiftSubscription.updateMany({
      where: { shiftId: input.shiftId, userId: input.userId },
      data: { status: "WITHDRAWN" },
    });

    // The spot is freed — cancel any Dimona declaration for auto-declare types.
    if (DimonaService.shouldAutoDeclare(worker?.contractType)) {
      await new DimonaService(this.db)
        .cancel({ shiftId: input.shiftId, workerId: input.userId })
        .catch((err) =>
          logger.warn({
            event: "dimona.cancel.failed",
            shiftId: input.shiftId,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
    }

    const business = await this.db.business.findUnique({
      where: { id: input.businessId },
      select: { ownerId: true },
    });
    if (business) {
      const dateLabel = shift.startsAt
        .toISOString()
        .slice(0, 16)
        .replace("T", " ");
      await this.notifications.create({
        userId: business.ownerId,
        type: "APPLICATION_WITHDRAWN",
        title: "Worker declined a rescheduled shift",
        body: `${worker?.name ?? "A worker"} can't make ${shift.roleLabel} on ${dateLabel}. The spot is open again.`,
        payload: { shiftId: shift.id, kind: "reschedule" },
        url: `/calendar`,
      });
    }

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: "SHIFT_RECONFIRM_DECLINED",
        entityType: "Shift",
        entityId: shift.id,
      },
    });

    logger.info({
      event: "shift.reschedule.declined",
      shiftId: shift.id,
      userId: input.userId,
    });
    publishEvent(input.businessId, {
      type: "assignment.changed",
      shiftId: shift.id,
    });

    return { success: true };
  }
}
