import { beforeEach, describe, expect, it } from "vitest";
import { NotificationService } from "@/application/services/notification-service";
import {
  asPrisma,
  createPrismaMock,
  type PrismaMock,
} from "../../helpers/mock-prisma";

const USER_ID = "user-1";

let prisma: PrismaMock;
let service: NotificationService;

beforeEach(() => {
  prisma = createPrismaMock();
  service = new NotificationService(asPrisma(prisma));
});

describe("NotificationService.list", () => {
  it("queries notifications for the user newest-first with default limit", async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    const result = await service.list({ userId: USER_ID });
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: { createdAt: "desc" },
      take: 26,
    });
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it("respects the requested limit and exposes nextCursor when truncating", async () => {
    const rows = [
      { id: "n1" },
      { id: "n2" },
      { id: "n3" },
      { id: "n4" },
      { id: "n5" },
      { id: "n6" },
    ];
    prisma.notification.findMany.mockResolvedValue(rows);
    const result = await service.list({ userId: USER_ID, limit: 5 });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 6 }),
    );
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBe("n6");
  });

  it("forwards the cursor when paginating further", async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    await service.list({ userId: USER_ID, limit: 5, cursor: "n5" });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "n5" },
        skip: 1,
      }),
    );
  });
});

describe("NotificationService.unreadCount", () => {
  it("counts notifications where readAt is null", async () => {
    prisma.notification.count.mockResolvedValue(3);
    const result = await service.unreadCount(USER_ID);
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: USER_ID, readAt: null },
    });
    expect(result).toEqual({ count: 3 });
  });
});

describe("NotificationService.markRead", () => {
  it("rejects when notification does not belong to the user (IDOR)", async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(
      service.markRead({ id: "notif-x", userId: USER_ID }),
    ).rejects.toThrow(/not found/i);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it("marks the notification as read with current timestamp", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "notif-1" });
    prisma.notification.update.mockResolvedValue({
      id: "notif-1",
      readAt: new Date(),
    });

    const result = await service.markRead({ id: "notif-1", userId: USER_ID });
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "notif-1" },
        data: expect.objectContaining({ readAt: expect.any(Date) }),
      }),
    );
    expect(result.readAt).toBeInstanceOf(Date);
  });
});

describe("NotificationService.markAllRead", () => {
  it("updates unread notifications for the user", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 4 });
    await service.markAllRead(USER_ID);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, readAt: null },
        data: expect.objectContaining({ readAt: expect.any(Date) }),
      }),
    );
  });
});
