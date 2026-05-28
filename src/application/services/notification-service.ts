import type { NotificationType, PrismaClient } from "@prisma/client";
import { sendPushToUser } from "@/infrastructure/push/sender";
import { logger } from "@/infrastructure/logging/logger";

export class NotificationService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Creates an in-app notification and fans it out as a web-push if the user
   * has registered any push subscriptions. Push delivery is best-effort.
   */
  async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    url?: string;
  }) {
    const notification = await this.db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload as object | undefined,
      },
    });
    sendPushToUser(this.db, input.userId, {
      title: input.title,
      body: input.body,
      url: input.url ?? "/notifications",
    }).catch((err) =>
      logger.warn({
        event: "notification.push.failed",
        userId: input.userId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return notification;
  }

  async list(input: { userId: string; limit?: number; cursor?: string }) {
    const limit = input.limit ?? 25;
    const items = await this.db.notification.findMany({
      where: { userId: input.userId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(input.cursor
        ? { cursor: { id: input.cursor }, skip: 1 }
        : {}),
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const last = items.pop();
      nextCursor = last ? last.id : null;
    }
    return { items, nextCursor };
  }

  async unreadCount(userId: string) {
    const count = await this.db.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(input: { id: string; userId: string }) {
    const notification = await this.db.notification.findFirst({
      where: { id: input.id, userId: input.userId },
    });
    if (!notification) {
      throw new Error("Notification not found");
    }

    return this.db.notification.update({
      where: { id: input.id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
