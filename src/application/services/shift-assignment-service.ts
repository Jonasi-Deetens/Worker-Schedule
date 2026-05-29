import type { PrismaClient } from "@prisma/client";
import { assertNoAssignmentOverlap } from "@/domain/rules/scheduling";
import type { TimeRange } from "@/domain/types";
import { logger } from "@/infrastructure/logging/logger";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import {
  cancelIfAuto,
  declareInIfAuto,
  recomputeStuQuartersIfStudent,
} from "./dimona-hooks";
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
   * Owner directly *offers* a shift to a worker. This does NOT instantly
   * confirm them: the assignment lands in PENDING_ACCEPTANCE and the mirrored
   * subscription in PENDING, so the worker still has to accept (or decline) it
   * themselves before it occupies a spot. Respects capacity (CONFIRMED only),
   * overlap, approved time-off, and scheduling rules. The actual Dimona
   * declaration is deferred to acceptance — we don't declare to ONSS for a
   * worker who hasn't committed yet.
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
    // Workers only ever see published shifts, so offering a draft would put the
    // worker on something they can't see or act on. Publish it first.
    if (shift.publishedAt === null) {
      throw new Error("Publish the shift before assigning workers");
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

    // Gate on an *active membership*, not the legacy User.businessId column.
    // Otherwise a worker who was never added to (or was removed from) the shop
    // could still be directly assigned — and instantly approved — purely
    // because a stale businessId happened to match.
    const worker = await this.db.user.findFirst({
      where: {
        id: input.workerId,
        memberships: { some: { businessId: input.businessId, status: "ACTIVE" } },
      },
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
    await this.rules.assertAssignable(
      input.workerId,
      { startsAt: shift.startsAt, endsAt: shift.endsAt },
      { businessId: input.businessId },
    );

    // No subscription is created here. A direct assignment is an *offer*: the
    // worker's pending state is represented purely by the PENDING_ACCEPTANCE
    // assignment. Mirroring a PENDING subscription would make the offer look
    // like a worker application — surfacing an owner "approve" button and a
    // duplicate pending entry on the worker side. The subscription is created
    // (APPROVED) only once the worker accepts, in `confirmReschedule`.
    const assignment = await this.db.shiftAssignment.create({
      data: {
        shiftId: input.shiftId,
        userId: input.workerId,
        status: "PENDING_ACCEPTANCE",
      },
    });

    const dateLabel = shift.startsAt.toISOString().slice(0, 10);
    await this.notifications.create({
      userId: input.workerId,
      type: "SHIFT_ASSIGNED",
      title: "You were offered a shift",
      body: `${shift.roleLabel} on ${dateLabel}. Confirm you can make it, or decline to free the spot.`,
      payload: { shiftId: shift.id, kind: "assignment" },
      url: `/applications`,
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
      event: "shift.offeredDirectly",
      shiftId: shift.id,
      workerId: input.workerId,
    });
    publishEvent(input.businessId, {
      type: "assignment.changed",
      shiftId: shift.id,
    });

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

    await cancelIfAuto(this.db, input.shiftId, input.workerId);
    // Removing a worker may empty (or shrink) their STU quarter — recompute so
    // the per-quarter Dimona + quota ledger reflect the dropped hours.
    await recomputeStuQuartersIfStudent(this.db, {
      workerId: input.workerId,
      businessId: input.businessId,
      dates: [shift.startsAt],
    });

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
   * Worker-facing list of shifts that are waiting on the worker's confirmation
   * — both freshly offered direct assignments (PENDING_ACCEPTANCE) and shifts
   * that were rescheduled after they were already on (PENDING_RECONFIRMATION).
   * Mirrors `BroadcastService.listForUser` in shape so the worker surfaces can
   * render confirm/decline cards exactly like broadcast cards.
   */
  async listPendingReconfirmations(input: {
    userId: string;
    businessId: string;
  }) {
    const assignments = await this.db.shiftAssignment.findMany({
      where: {
        userId: input.userId,
        status: { in: ["PENDING_RECONFIRMATION", "PENDING_ACCEPTANCE"] },
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
   * Worker locks in a shift that is waiting on them — either accepting a fresh
   * direct-assign offer (PENDING_ACCEPTANCE) or re-confirming a rescheduled
   * shift (PENDING_RECONFIRMATION). Mirrors the safety of
   * `BroadcastService.accept`: the shift must be live, still have a free
   * CONFIRMED spot, and the time must not clash with the worker's other
   * assignments or approved time-off. On success the assignment becomes
   * CONFIRMED, the mirrored subscription APPROVED, the shift is marked FILLED
   * if now full, and a Dimona IN is filed for auto-declare contracts.
   */
  async confirmReschedule(input: {
    shiftId: string;
    userId: string;
    businessId: string;
  }) {
    const shift = await this.db.shift.findFirst({
      where: { id: input.shiftId, businessId: input.businessId },
      include: { assignments: true },
    });
    if (!shift) throw new Error("Shift not found");
    if (shift.status === "CANCELLED") throw new Error("Shift is cancelled");
    if (shift.endsAt < new Date()) throw new Error("Shift already ended");

    const assignment = await this.db.shiftAssignment.findUnique({
      where: {
        shiftId_userId: { shiftId: input.shiftId, userId: input.userId },
      },
    });
    if (
      !assignment ||
      (assignment.status !== "PENDING_RECONFIRMATION" &&
        assignment.status !== "PENDING_ACCEPTANCE")
    ) {
      throw new Error("This shift is not awaiting your confirmation");
    }

    // Only CONFIRMED assignments occupy a spot. Several workers can be offered
    // the same shift, so re-check capacity at acceptance time — whoever
    // confirms first claims the remaining spot(s).
    const confirmedCount = (shift.assignments ?? []).filter(
      (a) => a.status === "CONFIRMED",
    ).length;
    if (confirmedCount >= shift.requiredSpots) {
      throw new Error("Shift already at capacity — the spot was just filled");
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
        "This time overlaps another shift — decline this one instead",
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
        "You have approved time-off at this time — decline this one instead",
      );
    }

    const wasReschedule = assignment.status === "PENDING_RECONFIRMATION";

    const updated = await this.db.shiftAssignment.update({
      where: { id: assignment.id },
      data: { status: "CONFIRMED" },
    });
    // Mirror the committed state onto a subscription. Direct-assign offers have
    // no subscription yet, so upsert (rather than update) to create it; the
    // reschedule path already has an APPROVED subscription and is left as-is.
    await this.db.shiftSubscription.upsert({
      where: {
        shiftId_userId: { shiftId: input.shiftId, userId: input.userId },
      },
      update: { status: "APPROVED" },
      create: {
        shiftId: input.shiftId,
        userId: input.userId,
        status: "APPROVED",
      },
    });

    // Mark the shift FILLED once the worker takes the last open spot.
    if (confirmedCount + 1 >= shift.requiredSpots && shift.status !== "FILLED") {
      await this.db.shift.update({
        where: { id: shift.id },
        data: { status: "FILLED" },
      });
    }

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: wasReschedule ? "SHIFT_RECONFIRMED" : "SHIFT_ASSIGNMENT_ACCEPTED",
        entityType: "Shift",
        entityId: shift.id,
      },
    });

    logger.info({
      event: wasReschedule
        ? "shift.reschedule.reconfirmed"
        : "shift.assignment.accepted",
      shiftId: shift.id,
      userId: input.userId,
    });
    publishEvent(input.businessId, {
      type: "assignment.changed",
      shiftId: shift.id,
    });

    await declareInIfAuto(this.db, shift.id, input.userId);
    // A newly-confirmed JOBSTUDENT adds planned hours to their quarter — file
    // (or update) the per-quarter Dimona STU declaration and quota ledger.
    await recomputeStuQuartersIfStudent(this.db, {
      workerId: input.userId,
      businessId: input.businessId,
      dates: [shift.startsAt],
    });

    return updated;
  }

  /**
   * Worker can't make a shift that was waiting on them — either declining a
   * fresh direct-assign offer or a rescheduled shift. Drops the assignment,
   * withdraws the mirrored subscription, and notifies the owner so they can
   * re-broadcast the now-open spot.
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
    if (
      !assignment ||
      (assignment.status !== "PENDING_RECONFIRMATION" &&
        assignment.status !== "PENDING_ACCEPTANCE")
    ) {
      throw new Error("This shift is not awaiting your confirmation");
    }

    const wasReschedule = assignment.status === "PENDING_RECONFIRMATION";

    const worker = await this.db.user.findUnique({
      where: { id: input.userId },
      select: { name: true },
    });

    await this.db.shiftAssignment.delete({ where: { id: assignment.id } });
    await this.db.shiftSubscription.updateMany({
      where: { shiftId: input.shiftId, userId: input.userId },
      data: { status: "WITHDRAWN" },
    });

    await cancelIfAuto(this.db, input.shiftId, input.userId);
    await recomputeStuQuartersIfStudent(this.db, {
      workerId: input.userId,
      businessId: input.businessId,
      dates: [shift.startsAt],
    });

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
        title: wasReschedule
          ? "Worker declined a rescheduled shift"
          : "Worker declined an assignment",
        body: `${worker?.name ?? "A worker"} can't make ${shift.roleLabel} on ${dateLabel}. The spot is open again.`,
        payload: {
          shiftId: shift.id,
          kind: wasReschedule ? "reschedule" : "assignment",
        },
        url: `/calendar`,
      });
    }

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: wasReschedule
          ? "SHIFT_RECONFIRM_DECLINED"
          : "SHIFT_ASSIGNMENT_DECLINED",
        entityType: "Shift",
        entityId: shift.id,
      },
    });

    logger.info({
      event: wasReschedule
        ? "shift.reschedule.declined"
        : "shift.assignment.declined",
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
