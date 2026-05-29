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

  it("treats a thrown fetch as a failure and enqueues a retry", async () => {
    db.webhookSubscription.findMany.mockResolvedValue([
      {
        id: "w1",
        url: "https://hook.example.com/abc",
        secret: "s",
        events: ["shift.created"],
      },
    ]);
    const fetcher = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const enqueue = vi.fn(async () => {});
    const svc = new WebhookService(
      db as unknown as PrismaClient,
      fetcher,
      enqueue,
    );

    await expect(
      svc.fan("shift.created", { shiftId: "s1" }, "b1"),
    ).resolves.toBeUndefined();
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "w1", event: "shift.created" }),
    );
  });

  it("treats a non-2xx response as a failure and enqueues a retry", async () => {
    db.webhookSubscription.findMany.mockResolvedValue([
      {
        id: "w1",
        url: "https://hook.example.com/abc",
        secret: "s",
        events: ["shift.created"],
      },
    ]);
    const fetcher = vi.fn(
      async () => new Response("nope", { status: 500 }),
    ) as unknown as typeof fetch;
    const enqueue = vi.fn(
      async (_job: { subscriptionId: string; event: string; body: string }) => {},
    );
    const svc = new WebhookService(
      db as unknown as PrismaClient,
      fetcher,
      enqueue,
    );

    await svc.fan("shift.created", { shiftId: "s1" }, "b1");
    expect(enqueue).toHaveBeenCalledOnce();
    const job = enqueue.mock.calls[0]![0];
    expect(JSON.parse(job.body)).toMatchObject({ event: "shift.created" });
  });

  it("does not enqueue a retry on a 2xx response", async () => {
    db.webhookSubscription.findMany.mockResolvedValue([
      { id: "w1", url: "https://hook.example.com", secret: "s", events: ["shift.created"] },
    ]);
    const fetcher = vi.fn(
      async () => new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;
    const enqueue = vi.fn(async () => {});
    const svc = new WebhookService(
      db as unknown as PrismaClient,
      fetcher,
      enqueue,
    );

    await svc.fan("shift.created", { shiftId: "s1" }, "b1");
    expect(enqueue).not.toHaveBeenCalled();
  });
});
