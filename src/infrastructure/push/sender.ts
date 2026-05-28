import webPush from "web-push";
import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";

/**
 * VAPID configuration is sourced from the environment at call time so unit
 * tests (and `tsx` reloads) pick up changes without requiring a module
 * reload. We accept missing keys gracefully: when push is not configured,
 * calls become no-ops and a warning is logged once per process.
 */
let warned = false;
let configuredFor: { pub: string; prv: string } | null = null;

function configure(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const prv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:ops@work-calendar.local";
  if (!pub || !prv) {
    if (!warned) {
      logger.warn({ event: "push.vapid.missing" });
      warned = true;
    }
    return false;
  }
  if (!configuredFor || configuredFor.pub !== pub || configuredFor.prv !== prv) {
    webPush.setVapidDetails(subject, pub, prv);
    configuredFor = { pub, prv };
  }
  return true;
}

export function getPublicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Sends a payload to every push subscription registered for `userId`.
 * Subscriptions returning 404/410 (gone) are removed from the database so we
 * stop trying. All other errors are logged but never thrown — callers must not
 * block on push delivery.
 */
export async function sendPushToUser(
  db: PrismaClient,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; gone: number }> {
  if (!configure()) return { sent: 0, gone: 0 };
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return { sent: 0, gone: 0 };

  let sent = 0;
  let gone = 0;
  const message = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          message,
        );
        sent += 1;
        await db.pushSubscription
          .update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined);
      } catch (err) {
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode: unknown }).statusCode)
            : null;
        if (status === 404 || status === 410) {
          gone += 1;
          await db.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => undefined);
        } else {
          logger.warn({
            event: "push.send.failed",
            subId: sub.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }),
  );
  return { sent, gone };
}
