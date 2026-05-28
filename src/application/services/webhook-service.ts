import { createHmac, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";

export const WEBHOOK_EVENTS = [
  "shift.created",
  "shift.updated",
  "shift.published",
  "assignment.created",
  "assignment.cancelled",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export class WebhookService {
  constructor(
    private readonly db: PrismaClient,
    /** Injectable fetch makes the service testable without nock. */
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  list(businessId: string) {
    return this.db.webhookSubscription.findMany({
      where: { businessId },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(input: {
    businessId: string;
    url: string;
    events: WebhookEvent[];
  }) {
    const invalid = input.events.filter(
      (e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent),
    );
    if (invalid.length) throw new Error(`Unknown event: ${invalid.join(", ")}`);
    const secret = randomBytes(32).toString("base64url");
    const row = await this.db.webhookSubscription.create({
      data: {
        businessId: input.businessId,
        url: input.url,
        secret,
        events: input.events,
      },
    });
    return { id: row.id, secret };
  }

  async delete(input: { id: string; businessId: string }) {
    const existing = await this.db.webhookSubscription.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!existing) throw new Error("Webhook not found");
    return this.db.webhookSubscription.delete({ where: { id: input.id } });
  }

  /**
   * Fire-and-forget delivery to every subscriber. Failures are logged but
   * never bubble back to the caller because webhooks are a best-effort fan-out.
   * A future job retries failed deliveries with exponential backoff.
   */
  async fan(
    event: WebhookEvent,
    payload: Record<string, unknown>,
    businessId: string,
  ): Promise<void> {
    let subs;
    try {
      subs = await this.db.webhookSubscription.findMany({
        where: { businessId, active: true, events: { has: event } },
      });
    } catch (err) {
      logger.warn({
        event: "webhook.lookup.failed",
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (!subs || subs.length === 0) return;
    const body = JSON.stringify({
      event,
      businessId,
      occurredAt: new Date().toISOString(),
      data: payload,
    });
    await Promise.all(
      subs.map(async (sub) => {
        const signature = createHmac("sha256", sub.secret)
          .update(body)
          .digest("hex");
        try {
          await this.fetcher(sub.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Tattoogenda-Event": event,
              "X-Tattoogenda-Signature": signature,
            },
            body,
          });
        } catch (err) {
          logger.warn({
            event: "webhook.delivery.failed",
            subscriptionId: sub.id,
            url: sub.url,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }
}
