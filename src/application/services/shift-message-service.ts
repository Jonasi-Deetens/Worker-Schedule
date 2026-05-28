import type { PrismaClient } from "@prisma/client";
import { publish as publishEvent } from "@/infrastructure/events/bus";

/**
 * Per-shift chat. Only users with an active assignment, an open subscription,
 * or the OWNER/MANAGER role can read/write. Rate limiting is enforced at the
 * router boundary (`src/infrastructure/rate-limit.ts`).
 */
export class ShiftMessageService {
  constructor(private readonly db: PrismaClient) {}

  private async assertAccess(shiftId: string, userId: string, isOwnerOrManager: boolean) {
    if (isOwnerOrManager) return;
    const [assignment, subscription] = await Promise.all([
      this.db.shiftAssignment.findFirst({ where: { shiftId, userId } }),
      this.db.shiftSubscription.findFirst({
        where: { shiftId, userId, status: { in: ["PENDING", "APPROVED"] } },
      }),
    ]);
    if (!assignment && !subscription) {
      throw new Error("You do not have access to this shift conversation");
    }
  }

  async list(input: { shiftId: string; userId: string; isOwnerOrManager: boolean }) {
    await this.assertAccess(input.shiftId, input.userId, input.isOwnerOrManager);
    return this.db.shiftMessage.findMany({
      where: { shiftId: input.shiftId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
  }

  async post(input: {
    shiftId: string;
    authorId: string;
    body: string;
    isOwnerOrManager: boolean;
    businessId: string;
  }) {
    await this.assertAccess(input.shiftId, input.authorId, input.isOwnerOrManager);
    const body = input.body.trim();
    if (!body) throw new Error("Message body cannot be empty");
    if (body.length > 2000) throw new Error("Message too long");

    const message = await this.db.shiftMessage.create({
      data: { shiftId: input.shiftId, authorId: input.authorId, body },
      include: { author: { select: { id: true, name: true } } },
    });
    publishEvent(input.businessId, {
      type: "shift.message.created",
      shiftId: input.shiftId,
    });
    return message;
  }
}
