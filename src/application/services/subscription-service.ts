import type { PrismaClient } from "@prisma/client";
import {
  assertNoAssignmentOverlap,
  canApproveSubscription,
  canRejectSubscription,
  canWithdrawSubscription,
  isShiftCapacityAvailable,
} from "@/domain/rules/scheduling";
import { logger } from "@/infrastructure/logging/logger";
import { SchedulingRules } from "./scheduling-rules";

export class SubscriptionService {
  private readonly rules: SchedulingRules;
  constructor(private readonly db: PrismaClient) {
    this.rules = new SchedulingRules(db);
  }

  async apply(input: { shiftId: string; userId: string; businessId: string }) {
    const shift = await this.db.shift.findFirst({
      where: { id: input.shiftId, businessId: input.businessId },
    });
    if (!shift) {
      throw new Error("Shift not found");
    }
    if (shift.status === "CANCELLED") {
      throw new Error("Cannot apply to a cancelled shift");
    }
    if (shift.publishedAt === null) {
      throw new Error("Cannot apply to an unpublished shift");
    }

    const timeOff = await this.rules.checkTimeOff(input.userId, {
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
    });
    if (timeOff) throw new Error(timeOff.message);

    const existing = await this.db.shiftSubscription.findUnique({
      where: {
        shiftId_userId: { shiftId: input.shiftId, userId: input.userId },
      },
    });
    if (existing && existing.status !== "REJECTED") {
      throw new Error("Already applied to this shift");
    }

    const subscription = existing
      ? await this.db.shiftSubscription.update({
          where: { id: existing.id },
          data: { status: "PENDING" },
        })
      : await this.db.shiftSubscription.create({
          data: {
            shiftId: input.shiftId,
            userId: input.userId,
            status: "PENDING",
          },
        });

    const owner = await this.db.business.findUnique({
      where: { id: input.businessId },
      select: { ownerId: true },
    });

    if (owner) {
      await this.db.notification.create({
        data: {
          userId: owner.ownerId,
          type: "NEW_SUBSCRIPTION",
          title: "New shift application",
          body: "A worker applied to a shift.",
          payload: { shiftId: input.shiftId, subscriptionId: subscription.id },
        },
      });
    }

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: "SUBSCRIPTION_APPLIED",
        entityType: "ShiftSubscription",
        entityId: subscription.id,
      },
    });

    logger.info({
      event: "subscription.applied",
      shiftId: input.shiftId,
      userId: input.userId,
    });

    return subscription;
  }

  async withdraw(input: { subscriptionId: string; userId: string }) {
    const subscription = await this.db.shiftSubscription.findFirst({
      where: { id: input.subscriptionId, userId: input.userId },
      include: { shift: { include: { business: true } } },
    });
    if (!subscription) {
      throw new Error("Subscription not found");
    }
    if (!canWithdrawSubscription(subscription.status)) {
      throw new Error("Can only withdraw pending applications");
    }

    const updated = await this.db.shiftSubscription.update({
      where: { id: subscription.id },
      data: { status: "WITHDRAWN" },
    });

    await this.db.notification.create({
      data: {
        userId: subscription.shift.business.ownerId,
        type: "APPLICATION_WITHDRAWN",
        title: "Application withdrawn",
        body: "A worker withdrew their shift application.",
        payload: { shiftId: subscription.shiftId, subscriptionId: subscription.id },
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.userId,
        action: "SUBSCRIPTION_WITHDRAWN",
        entityType: "ShiftSubscription",
        entityId: subscription.id,
      },
    });

    return updated;
  }

  async approve(input: {
    subscriptionId: string;
    ownerId: string;
    businessId: string;
  }) {
    return this.db.$transaction(async (tx) => {
      const subscription = await tx.shiftSubscription.findFirst({
        where: {
          id: input.subscriptionId,
          shift: { businessId: input.businessId },
        },
        include: { shift: true, user: true },
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }
      if (!canApproveSubscription(subscription.status)) {
        throw new Error("Can only approve pending applications");
      }

      const approvedCount = await tx.shiftAssignment.count({
        where: { shiftId: subscription.shiftId },
      });

      if (
        !isShiftCapacityAvailable(
          approvedCount,
          subscription.shift.requiredSpots,
        )
      ) {
        throw new Error("Shift is already at capacity");
      }

      const existingAssignments = await tx.shiftAssignment.findMany({
        where: { userId: subscription.userId },
        include: { shift: true },
      });

      assertNoAssignmentOverlap(
        {
          startsAt: subscription.shift.startsAt,
          endsAt: subscription.shift.endsAt,
        },
        existingAssignments.map((a) => ({
          startsAt: a.shift.startsAt,
          endsAt: a.shift.endsAt,
        })),
      );

      const ruleViolations = await this.rules.checkAll(subscription.userId, {
        startsAt: subscription.shift.startsAt,
        endsAt: subscription.shift.endsAt,
      });
      if (ruleViolations.length > 0) {
        throw new Error(
          ruleViolations.map((v) => v.message).join("; "),
        );
      }

      await tx.shiftSubscription.update({
        where: { id: subscription.id },
        data: { status: "APPROVED" },
      });

      const assignment = await tx.shiftAssignment.create({
        data: {
          shiftId: subscription.shiftId,
          userId: subscription.userId,
        },
      });

      const filledCount = approvedCount + 1;
      if (filledCount >= subscription.shift.requiredSpots) {
        await tx.shift.update({
          where: { id: subscription.shiftId },
          data: { status: "FILLED" },
        });
      }

      await tx.notification.create({
        data: {
          userId: subscription.userId,
          type: "APPLICATION_APPROVED",
          title: "Application approved",
          body: `You were approved for ${subscription.shift.roleLabel}.`,
          payload: {
            shiftId: subscription.shiftId,
            subscriptionId: subscription.id,
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          userId: input.ownerId,
          action: "SUBSCRIPTION_APPROVED",
          entityType: "ShiftSubscription",
          entityId: subscription.id,
        },
      });

      logger.info({
        event: "subscription.approved",
        subscriptionId: subscription.id,
        shiftId: subscription.shiftId,
      });

      return assignment;
    });
  }

  async reject(input: {
    subscriptionId: string;
    ownerId: string;
    businessId: string;
  }) {
    const subscription = await this.db.shiftSubscription.findFirst({
      where: {
        id: input.subscriptionId,
        shift: { businessId: input.businessId },
      },
      include: { shift: true },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }
    if (!canRejectSubscription(subscription.status)) {
      throw new Error("Can only reject pending applications");
    }

    const updated = await this.db.shiftSubscription.update({
      where: { id: subscription.id },
      data: { status: "REJECTED" },
    });

    await this.db.notification.create({
      data: {
        userId: subscription.userId,
        type: "APPLICATION_REJECTED",
        title: "Application rejected",
        body: `Your application for ${subscription.shift.roleLabel} was not approved.`,
        payload: {
          shiftId: subscription.shiftId,
          subscriptionId: subscription.id,
        },
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SUBSCRIPTION_REJECTED",
        entityType: "ShiftSubscription",
        entityId: subscription.id,
      },
    });

    return updated;
  }

  async listForShift(shiftId: string, businessId: string) {
    const shift = await this.db.shift.findFirst({
      where: { id: shiftId, businessId },
    });
    if (!shift) {
      throw new Error("Shift not found");
    }

    return this.db.shiftSubscription.findMany({
      where: { shiftId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Returns every subscription the calling worker owns, with the joined shift
   * for the worker's "My applications" view.
   */
  async listMine(userId: string) {
    return this.db.shiftSubscription.findMany({
      where: { userId },
      include: {
        shift: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            roleLabel: true,
            status: true,
            requiredSpots: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Approves several subscriptions sequentially inside a single client call.
   * Each individual approval still runs through `approve()` so capacity,
   * overlap and notification rules stay in one place. Returns a per-id result.
   */
  async approveMany(input: {
    subscriptionIds: string[];
    ownerId: string;
    businessId: string;
  }) {
    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const id of input.subscriptionIds) {
      try {
        await this.approve({
          subscriptionId: id,
          ownerId: input.ownerId,
          businessId: input.businessId,
        });
        results.push({ id, success: true });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return results;
  }

  async rejectMany(input: {
    subscriptionIds: string[];
    ownerId: string;
    businessId: string;
  }) {
    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const id of input.subscriptionIds) {
      try {
        await this.reject({
          subscriptionId: id,
          ownerId: input.ownerId,
          businessId: input.businessId,
        });
        results.push({ id, success: true });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return results;
  }
}
