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

/** Payload enqueued for a retried webhook delivery. */
export interface WebhookDeliveryJob {
  subscriptionId: string;
  event: WebhookEvent;
  /** Exact JSON body that was signed, so the retry signature stays stable. */
  body: string;
}

export type WebhookRetryEnqueue = (job: WebhookDeliveryJob) => Promise<void>;

/** Returns only the host of a URL so we never log the full (secret-y) path. */
export function webhookHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

/**
 * Default retry enqueuer — lazily imports the pg-boss queue so importing this
 * service (e.g. from a unit test) never opens a Postgres connection. Failed
 * deliveries are retried with bounded exponential backoff (up to 5 attempts).
 */
const defaultEnqueueRetry: WebhookRetryEnqueue = async (job) => {
  const { getQueue, JOBS } = await import("@/infrastructure/jobs/queue");
  const boss = await getQueue();
  await boss.send(JOBS.WEBHOOK_DELIVER, job, {
    retryLimit: 5,
    retryDelay: 10,
    retryBackoff: true,
  });
};

export class WebhookService {
  constructor(
    private readonly db: PrismaClient,
    /** Injectable fetch makes the service testable without nock. */
    private readonly fetcher: typeof fetch = fetch,
    /** Injectable retry enqueuer keeps the pg-boss dependency test-friendly. */
    private readonly enqueueRetry: WebhookRetryEnqueue = defaultEnqueueRetry,
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
   * Fan delivery out to every subscriber. The first attempt happens inline; a
   * non-2xx response or a thrown fetch error is treated as a failure and the
   * delivery is re-enqueued onto pg-boss for bounded exponential-backoff retry.
   * Failures never bubble back to the caller — webhooks are best-effort and
   * must not break the originating mutation.
   *
   * Note: we log the subscription id + host only, never the full URL, since
   * the path/query can carry per-tenant secrets.
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
          const response = await this.fetcher(sub.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-WorkCalendar-Event": event,
              "X-WorkCalendar-Signature": signature,
            },
            body,
          });
          if (!response.ok) {
            throw new Error(`Endpoint returned status ${response.status}`);
          }
        } catch (err) {
          logger.warn({
            event: "webhook.delivery.failed",
            subscriptionId: sub.id,
            host: webhookHost(sub.url),
            error: err instanceof Error ? err.message : String(err),
          });
          await this.enqueueRetry({ subscriptionId: sub.id, event, body }).catch(
            (enqueueErr) =>
              logger.warn({
                event: "webhook.retry.enqueueFailed",
                subscriptionId: sub.id,
                host: webhookHost(sub.url),
                error:
                  enqueueErr instanceof Error
                    ? enqueueErr.message
                    : String(enqueueErr),
              }),
          );
        }
      }),
    );
  }
}
