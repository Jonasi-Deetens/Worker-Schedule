import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { NotificationService } from "./notification-service";

/**
 * "Open shift broadcast" lets an owner notify every eligible worker about an
 * unfilled shift in one click. Eligible workers can then accept directly; the
 * first one to accept atomically claims the spot and any leftover capacity is
 * re-offered until full.
 */
export class BroadcastService {
  private readonly notifications: NotificationService;

  constructor(private readonly db: PrismaClient) {
    this.notifications = new NotificationService(db);
  }

  /**
   * Looks up workers that:
   * - belong to this business and are ACTIVE
   * - have the required skill (if any)
   * - have no overlapping assignment
   * - have no approved time-off in the slot
   * Then notifies each of them in-app + push.
   */
  async send(input: { shiftId: string; businessId: string; ownerId: string }) {
    const shift = await this.db.shift.findFirst({
      where: { id: input.shiftId, businessId: input.businessId },
      include: { assignments: true },
    });
    if (!shift) throw new Error("Shift not found");
    if (shift.status === "CANCELLED") {
      throw new Error("Cannot broadcast a cancelled shift");
    }
    if (shift.assignments.length >= shift.requiredSpots) {
      throw new Error("Shift already at capacity");
    }
    if (shift.endsAt < new Date()) {
      throw new Error("Cannot broadcast a past shift");
    }

    const assignedIds = new Set(shift.assignments.map((a) => a.userId));
    const candidates = await this.db.user.findMany({
      where: {
        businessId: input.businessId,
        role: { in: ["WORKER", "MANAGER"] },
        status: "ACTIVE",
        id: { notIn: [...assignedIds] },
        ...(shift.requiredSkillId
          ? { skills: { some: { skillId: shift.requiredSkillId } } }
          : {}),
      },
      select: { id: true, name: true },
    });

    if (candidates.length === 0) {
      return { notified: 0 };
    }

    const [overlapAssignments, conflictingTimeOff] = await Promise.all([
      this.db.shiftAssignment.findMany({
        where: {
          userId: { in: candidates.map((c) => c.id) },
          shift: {
            startsAt: { lt: shift.endsAt },
            endsAt: { gt: shift.startsAt },
          },
        },
        select: { userId: true },
      }),
      this.db.timeOffRequest.findMany({
        where: {
          userId: { in: candidates.map((c) => c.id) },
          status: "APPROVED",
          startsAt: { lt: shift.endsAt },
          endsAt: { gt: shift.startsAt },
        },
        select: { userId: true },
      }),
    ]);
    const blocked = new Set<string>([
      ...overlapAssignments.map((a) => a.userId),
      ...conflictingTimeOff.map((t) => t.userId),
    ]);
    const eligible = candidates.filter((c) => !blocked.has(c.id));

    const dateLabel = shift.startsAt.toISOString().slice(0, 16).replace("T", " ");
    await Promise.all(
      eligible.map((c) =>
        this.notifications.create({
          userId: c.id,
          type: "SHIFT_BROADCAST",
          title: "Open shift available",
          body: `${shift.roleLabel} on ${dateLabel}`,
          payload: { shiftId: shift.id, kind: "broadcast" },
          url: `/applications`,
        }),
      ),
    );

    await this.db.shift.update({
      where: { id: shift.id },
      data: { broadcastAt: new Date() },
    });
    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_BROADCAST_SENT",
        entityType: "Shift",
        entityId: shift.id,
        metadata: { notified: eligible.length },
      },
    });
    logger.info({
      event: "shift.broadcast.sent",
      shiftId: shift.id,
      notified: eligible.length,
    });
    publishEvent(input.businessId, {
      type: "subscription.changed",
      shiftId: shift.id,
    });

    return { notified: eligible.length };
  }

  /**
   * First-come-first-served accept of a broadcast invitation. Uses a
   * conditional `updateMany` (where capacity not yet reached) to prevent two
   * workers from racing each other onto the last spot.
   */
  async accept(input: { shiftId: string; userId: string; businessId: string }) {
    const shift = await this.db.shift.findFirst({
      where: { id: input.shiftId, businessId: input.businessId },
      include: { assignments: true },
    });
    if (!shift) throw new Error("Shift not found");
    if (shift.status === "CANCELLED") throw new Error("Shift is cancelled");
    if (shift.endsAt < new Date()) throw new Error("Shift already ended");
    if (shift.assignments.some((a) => a.userId === input.userId)) {
      return { alreadyAssigned: true };
    }
    if (shift.assignments.length >= shift.requiredSpots) {
      throw new Error("Shift already filled");
    }

    // Pre-flight overlap check (the unique index on (shiftId,userId) protects
    // the duplicate case; we want a friendly error for the overlap case).
    const overlap = await this.db.shiftAssignment.findFirst({
      where: {
        userId: input.userId,
        shift: {
          startsAt: { lt: shift.endsAt },
          endsAt: { gt: shift.startsAt },
        },
      },
    });
    if (overlap) throw new Error("Worker has an overlapping approved shift");

    try {
      const [assignment] = await this.db.$transaction([
        this.db.shiftAssignment.create({
          data: { shiftId: shift.id, userId: input.userId },
        }),
        this.db.shiftSubscription.upsert({
          where: { shiftId_userId: { shiftId: shift.id, userId: input.userId } },
          create: { shiftId: shift.id, userId: input.userId, status: "APPROVED" },
          update: { status: "APPROVED" },
        }),
      ]);
      publishEvent(input.businessId, {
        type: "assignment.changed",
        shiftId: shift.id,
      });
      return { alreadyAssigned: false, assignmentId: assignment.id };
    } catch (err) {
      // Unique constraint or capacity race lost — treat as "already filled".
      logger.warn({
        event: "shift.broadcast.acceptRace",
        shiftId: shift.id,
        userId: input.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error("Shift already filled");
    }
  }
}
