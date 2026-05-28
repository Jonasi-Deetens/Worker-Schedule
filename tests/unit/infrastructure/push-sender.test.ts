import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import webPush from "web-push";
import type { PrismaClient } from "@prisma/client";
import { sendPushToUser } from "@/infrastructure/push/sender";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

const sendMock = webPush.sendNotification as unknown as ReturnType<typeof vi.fn>;

describe("sendPushToUser", () => {
  let db: PrismaMock;
  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = "x";
    process.env.VAPID_PRIVATE_KEY = "y";
    db = createPrismaMock();
    sendMock.mockReset();
  });

  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it("no-ops when there are no subscriptions", async () => {
    db.pushSubscription.findMany.mockResolvedValue([]);
    const res = await sendPushToUser(db as unknown as PrismaClient, "u1", {
      title: "hi",
      body: "yo",
    });
    expect(res).toEqual({ sent: 0, gone: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends to every subscription on success", async () => {
    db.pushSubscription.findMany.mockResolvedValue([
      { id: "1", endpoint: "https://a", p256dh: "p", auth: "a" },
      { id: "2", endpoint: "https://b", p256dh: "p", auth: "a" },
    ]);
    sendMock.mockResolvedValue({});
    db.pushSubscription.update.mockResolvedValue({});
    const res = await sendPushToUser(db as unknown as PrismaClient, "u1", {
      title: "hi",
      body: "yo",
    });
    expect(res.sent).toBe(2);
    expect(res.gone).toBe(0);
  });

  it("deletes subscriptions that return 410 Gone", async () => {
    db.pushSubscription.findMany.mockResolvedValue([
      { id: "1", endpoint: "https://a", p256dh: "p", auth: "a" },
    ]);
    sendMock.mockRejectedValue({ statusCode: 410, body: "gone" });
    db.pushSubscription.delete.mockResolvedValue({});
    const res = await sendPushToUser(db as unknown as PrismaClient, "u1", {
      title: "hi",
      body: "yo",
    });
    expect(res.sent).toBe(0);
    expect(res.gone).toBe(1);
    expect(db.pushSubscription.delete).toHaveBeenCalled();
  });
});
