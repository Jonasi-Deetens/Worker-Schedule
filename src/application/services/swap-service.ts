import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";

/**
 * Worker-to-worker shift swap: the holder of an APPROVED subscription offers
 * it to another worker; the other worker accepts or rejects. On accept, the
 * existing assignment is transferred atomically.
 */
export class SwapService {
  constructor(private readonly db: PrismaClient) {}

  async offer(input: {
    subscriptionId: string;
    fromUserId: string;
    toUserId: string;
    message?: string;
  }) {
    if (input.fromUserId === input.toUserId) {
      throw new Error("Cannot offer a swap to yourself");
    }

    const sub = await this.db.shiftSubscription.findFirst({
      where: {
        id: input.subscriptionId,
        userId: input.fromUserId,
        status: "APPROVED",
      },
      include: { shift: true },
    });
    if (!sub) throw new Error("Approved subscription not found");

    const target = await this.db.user.findFirst({
      where: {
        id: input.toUserId,
        businessId: sub.shift.businessId,
        status: "ACTIVE",
      },
    });
    if (!target) throw new Error("Target worker not found");

    const conflict = await this.db.shiftAssignment.findFirst({
      where: {
        userId: input.toUserId,
        shift: {
          startsAt: { lt: sub.shift.endsAt },
          endsAt: { gt: sub.shift.startsAt },
        },
      },
    });
    if (conflict) throw new Error("Target worker has an overlapping shift");

    const swap = await this.db.shiftSwap.create({
      data: {
        fromSubscriptionId: sub.id,
        toUserId: input.toUserId,
        message: input.message,
      },
    });

    await this.db.notification.create({
      data: {
        userId: input.toUserId,
        type: "SHIFT_SWAP_REQUESTED",
        title: "Shift swap requested",
        body: `Someone wants to give you the ${sub.shift.roleLabel} shift on ${sub.shift.startsAt.toISOString().slice(0, 10)}.`,
        payload: { swapId: swap.id, shiftId: sub.shift.id },
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.fromUserId,
        action: "SWAP_REQUESTED",
        entityType: "ShiftSwap",
        entityId: swap.id,
      },
    });

    logger.info({ event: "swap.offered", id: swap.id });
    return swap;
  }

  async listMine(userId: string) {
    const [outgoing, incoming] = await Promise.all([
      this.db.shiftSwap.findMany({
        where: { fromSubscription: { userId } },
        include: {
          fromSubscription: { include: { shift: true } },
          toUser: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.db.shiftSwap.findMany({
        where: { toUserId: userId },
        include: {
          fromSubscription: {
            include: {
              shift: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { outgoing, incoming };
  }

  async decide(input: {
    id: string;
    decidingUserId: string;
    accept: boolean;
  }) {
    const swap = await this.db.shiftSwap.findFirst({
      where: { id: input.id, toUserId: input.decidingUserId, status: "PENDING" },
      include: {
        fromSubscription: { include: { shift: true } },
      },
    });
    if (!swap) throw new Error("Swap not found or not actionable");

    if (!input.accept) {
      const rejected = await this.db.shiftSwap.update({
        where: { id: swap.id },
        data: { status: "REJECTED", decidedAt: new Date() },
      });
      await this.db.notification.create({
        data: {
          userId: swap.fromSubscription.userId,
          type: "SHIFT_SWAP_DECIDED",
          title: "Swap rejected",
          body: `${swap.fromSubscription.shift.roleLabel} swap was rejected.`,
          payload: { swapId: swap.id, accepted: false },
        },
      });
      return rejected;
    }

    // Accept: transfer assignment and subscription to the new user.
    const fromUserId = swap.fromSubscription.userId;
    const shift = swap.fromSubscription.shift;

    const conflict = await this.db.shiftAssignment.findFirst({
      where: {
        userId: input.decidingUserId,
        shift: {
          startsAt: { lt: shift.endsAt },
          endsAt: { gt: shift.startsAt },
        },
      },
    });
    if (conflict) throw new Error("You now have a conflicting shift");

    await this.db.$transaction([
      this.db.shiftAssignment.deleteMany({
        where: { shiftId: shift.id, userId: fromUserId },
      }),
      this.db.shiftAssignment.create({
        data: { shiftId: shift.id, userId: input.decidingUserId },
      }),
      this.db.shiftSubscription.update({
        where: { id: swap.fromSubscriptionId },
        data: { status: "WITHDRAWN" },
      }),
      this.db.shiftSubscription.upsert({
        where: {
          shiftId_userId: {
            shiftId: shift.id,
            userId: input.decidingUserId,
          },
        },
        create: {
          shiftId: shift.id,
          userId: input.decidingUserId,
          status: "APPROVED",
        },
        update: { status: "APPROVED" },
      }),
      this.db.shiftSwap.update({
        where: { id: swap.id },
        data: { status: "ACCEPTED", decidedAt: new Date() },
      }),
    ]);

    await this.db.notification.create({
      data: {
        userId: fromUserId,
        type: "SHIFT_SWAP_DECIDED",
        title: "Swap accepted",
        body: `Your ${shift.roleLabel} shift is now covered.`,
        payload: { swapId: swap.id, accepted: true },
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.decidingUserId,
        action: "SWAP_DECIDED",
        entityType: "ShiftSwap",
        entityId: swap.id,
        metadata: { accepted: true },
      },
    });

    return this.db.shiftSwap.findUnique({ where: { id: swap.id } });
  }

  async cancel(input: { id: string; requestingUserId: string }) {
    const swap = await this.db.shiftSwap.findFirst({
      where: {
        id: input.id,
        status: "PENDING",
        fromSubscription: { userId: input.requestingUserId },
      },
    });
    if (!swap) throw new Error("Swap not found or already decided");
    return this.db.shiftSwap.update({
      where: { id: swap.id },
      data: { status: "CANCELLED", decidedAt: new Date() },
    });
  }
}
