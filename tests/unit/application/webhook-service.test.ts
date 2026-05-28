import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { WebhookService } from "@/application/services/webhook-service";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

describe("WebhookService", () => {
  let db: PrismaMock;
  beforeEach(() => {
    db = createPrismaMock();
  });

  it("rejects unknown events on create", async () => {
    const svc = new WebhookService(db as unknown as PrismaClient);
    await expect(
      svc.create({
        businessId: "b1",
        url: "https://example.com",
        // @ts-expect-error testing runtime validation
        events: ["not.a.real.event"],
      }),
    ).rejects.toThrow(/Unknown event/);
  });

  it("includes an HMAC signature when posting deliveries", async () => {
    db.webhookSubscription.findMany.mockResolvedValue([
      {
        id: "w1",
        url: "https://hook.example.com",
        secret: "shh",
        events: ["shift.created"],
      },
    ]);
    const fetcher = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;
    const svc = new WebhookService(db as unknown as PrismaClient, fetcher);
    await svc.fan("shift.created", { shiftId: "s1" }, "b1");
    expect(fetcher).toHaveBeenCalledOnce();
    const call = (fetcher as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    const init = call[1] as RequestInit;
    expect(init.headers).toMatchObject({
      "X-WorkCalendar-Event": "shift.created",
    });
    expect(init.headers as Record<string, string>).toHaveProperty(
      "X-WorkCalendar-Signature",
    );
  });

  it("swallows fetch failures", async () => {
    db.webhookSubscription.findMany.mockResolvedValue([
      { id: "w1", url: "https://x", secret: "s", events: ["shift.created"] },
    ]);
    const fetcher = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const svc = new WebhookService(db as unknown as PrismaClient, fetcher);
    await expect(
      svc.fan("shift.created", { shiftId: "s1" }, "b1"),
    ).resolves.toBeUndefined();
  });
});
