import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { NotificationService } from "./notification-service";
import { SchedulingRules } from "./scheduling-rules";

/**
 * "Open shift broadcast" lets an owner notify every eligible worker about an
 * unfilled shift in one click. Eligible workers can then accept directly; the
 * first one to accept atomically claims the spot and any leftover capacity is
 * re-offered until full.
 */
export class BroadcastService {
  private readonly notifications: NotificationService;
  private readonly rules: SchedulingRules;

  constructor(private readonly db: PrismaClient) {
    this.notifications = new NotificationService(db);
    this.rules = new SchedulingRules(db);
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
   * Open broadcast invitations the worker still has a shot at — read from
   * the per-user notification inbox, cross-referenced against the current
   * shift state so already-filled or already-assigned-to-this-worker shifts
   * are dropped before they reach the UI.
   */
  async listForUser(input: { userId: string; businessId: string }) {
    const broadcasts = await this.db.notification.findMany({
      where: {
        userId: input.userId,
        type: "SHIFT_BROADCAST",
        readAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    const shiftIds = broadcasts
      .map((n) => (n.payload as { shiftId?: string } | null)?.shiftId)
      .filter((id): id is string => Boolean(id));
    if (shiftIds.length === 0) return [];

    const shifts = await this.db.shift.findMany({
      where: {
        id: { in: shiftIds },
        businessId: input.businessId,
        endsAt: { gt: new Date() },
        status: { not: "CANCELLED" },
      },
      include: { assignments: { select: { userId: true } } },
    });
    return shifts
      .filter(
        (s) =>
          s.assignments.length < s.requiredSpots &&
          !s.assignments.some((a) => a.userId === input.userId),
      )
      .map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        roleLabel: s.roleLabel,
        requiredSpots: s.requiredSpots,
        approvedCount: s.assignments.length,
      }));
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

    // Centralised scheduling-rule enforcement (min rest, weekly cap, age,
    // time-off). Mirrors the approve/assign/swap paths so no entry point can
    // commit an assignment that breaks a hard rule.
    await this.rules.assertAssignable(input.userId, {
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
    });

    try {
      const assignment = await this.db.$transaction(async (tx) => {
        // Re-check capacity *inside* the transaction against the live count of
        // CONFIRMED assignments. Two workers racing onto the last spot will
        // serialise here so we can never exceed `requiredSpots`.
        const confirmedCount = await tx.shiftAssignment.count({
          where: { shiftId: shift.id, status: "CONFIRMED" },
        });
        if (confirmedCount >= shift.requiredSpots) {
          throw new Error("Shift is already at capacity");
        }
        const created = await tx.shiftAssignment.create({
          data: { shiftId: shift.id, userId: input.userId },
        });
        await tx.shiftSubscription.upsert({
          where: { shiftId_userId: { shiftId: shift.id, userId: input.userId } },
          create: { shiftId: shift.id, userId: input.userId, status: "APPROVED" },
          update: { status: "APPROVED" },
        });
        return created;
      });
      publishEvent(input.businessId, {
        type: "assignment.changed",
        shiftId: shift.id,
      });
      return { alreadyAssigned: false, assignmentId: assignment.id };
    } catch (err) {
      // The capacity guard is a real, user-facing conflict — surface it as-is.
      if (err instanceof Error && /capacity/i.test(err.message)) {
        throw err;
      }
      // Unique constraint or other race lost — treat as "already filled".
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
