import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { AvailabilityService } from "@/application/services/availability-service";
import type { DimonaDeclareJob } from "@/application/services/dimona-declare-job";
import { DimonaService } from "@/application/services/dimona-service";
import { EmailService } from "@/application/services/email-service";
import { GdprService } from "@/application/services/gdpr-service";
import type { GdprPurgeJob } from "@/application/services/gdpr-purge-job";
import { NotificationService } from "@/application/services/notification-service";
import {
  webhookHost,
  type WebhookDeliveryJob,
} from "@/application/services/webhook-service";
import { getDimonaAdapter } from "@/infrastructure/dimona/adapter";
import { isStorageConfigured } from "@/application/services/document-service";
import { logger } from "@/infrastructure/logging/logger";
import { env } from "@/lib/env";
import {
  deleteObject,
  objectKeyFromUrl,
} from "@/infrastructure/storage/s3-delete";
import { getTranslator } from "@/lib/server-i18n";

/**
 * Plain async functions used by both the worker entrypoint and tests. Each
 * returns a structured summary the caller can log or assert on.
 */

/**
 * Materialises every active AvailabilityTemplate into concrete Availability
 * rows over the next `daysAhead` days. Idempotent: the underlying service
 * skips rows that already exist.
 */
export async function runAvailabilityMaterialise(
  db: PrismaClient,
  daysAhead = 14,
): Promise<{ users: number; created: number }> {
  const service = new AvailabilityService(db);
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE",
      availabilityTemplates: { some: {} },
    },
    select: { id: true },
  });
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + daysAhead * 86_400_000);
  let created = 0;
  for (const u of users) {
    created += await service.materialiseTemplates(u.id, from, to);
  }
  logger.info({
    event: "jobs.availability.materialised",
    users: users.length,
    created,
  });
  return { users: users.length, created };
}

/**
 * Sends a 24h reminder for every published shift starting in the next 23-25h
 * window that has assignments and hasn't been reminded yet.
 */
export async function runShiftReminders24h(
  db: PrismaClient,
  emails: EmailService = new EmailService(),
): Promise<{ shifts: number; recipients: number }> {
  const now = new Date();
  const lower = new Date(now.getTime() + 23 * 3_600_000);
  const upper = new Date(now.getTime() + 25 * 3_600_000);
  const shifts = await db.shift.findMany({
    where: {
      startsAt: { gte: lower, lte: upper },
      publishedAt: { not: null },
      reminderSentAt: null,
      status: { not: "CANCELLED" },
      assignments: { some: {} },
    },
    include: {
      business: { select: { name: true } },
      assignments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              locale: true,
              notificationPrefs: true,
            },
          },
        },
      },
    },
  });
  const notifier = new NotificationService(db);
  let recipients = 0;
  for (const shift of shifts) {
    const time = shift.startsAt.toISOString().slice(11, 16);
    for (const a of shift.assignments) {
      // Localised in-app + push, per the worker's saved locale.
      const t = await getTranslator(a.user?.locale);
      await notifier.create({
        userId: a.userId,
        type: "SHIFT_REMINDER_24H",
        title: t("notifications.reminder24hTitle"),
        body: t("notifications.reminder24hBody", {
          role: shift.roleLabel,
          time,
        }),
        payload: { shiftId: shift.id },
        url: "/calendar",
      });
      // Best-effort localised email (template copy stays English for now).
      if (a.user?.email && shift.business?.name) {
        await emails.sendShiftReminder(
          {
            email: a.user.email,
            name: a.user.name,
            notificationPrefs: a.user.notificationPrefs,
          },
          {
            recipientName: a.user.name,
            businessName: shift.business.name,
            shiftLabel: shift.roleLabel,
            shiftStart: shift.startsAt,
          },
        );
      }
      recipients += 1;
    }
    await db.shift.update({
      where: { id: shift.id },
      data: { reminderSentAt: new Date() },
    });
  }
  logger.info({
    event: "jobs.shift.reminders24h",
    shifts: shifts.length,
    recipients,
  });
  return { shifts: shifts.length, recipients };
}

/**
 * Deletes invites that expired more than `graceDays` ago and haven't been
 * accepted. We keep recent expirations around briefly so a `/invite/[token]`
 * page can still show a friendly "expired" message.
 */
export async function runInviteCleanup(
  db: PrismaClient,
  graceDays = 7,
): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - graceDays * 86_400_000);
  const result = await db.invite.deleteMany({
    where: { acceptedAt: null, expiresAt: { lt: cutoff } },
  });
  logger.info({ event: "jobs.invite.cleanup", deleted: result.count });
  return { deleted: result.count };
}

/**
 * Re-attempts a single webhook delivery that failed its inline attempt. On a
 * non-2xx response or a network error it *throws*, which signals pg-boss to
 * retry the job (with the bounded exponential backoff configured at enqueue
 * time). A missing or deactivated subscription is treated as success so a
 * deleted webhook doesn't get retried forever.
 */
export async function runWebhookDelivery(
  db: PrismaClient,
  job: WebhookDeliveryJob,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const sub = await db.webhookSubscription.findUnique({
    where: { id: job.subscriptionId },
  });
  if (!sub || !sub.active) {
    logger.info({
      event: "webhook.retry.skipped",
      subscriptionId: job.subscriptionId,
    });
    return;
  }

  const signature = createHmac("sha256", sub.secret)
    .update(job.body)
    .digest("hex");

  const response = await fetcher(sub.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-WorkCalendar-Event": job.event,
      "X-WorkCalendar-Signature": signature,
    },
    body: job.body,
  });

  if (!response.ok) {
    logger.warn({
      event: "webhook.retry.failed",
      subscriptionId: sub.id,
      host: webhookHost(sub.url),
      status: response.status,
    });
    throw new Error(`Webhook delivery failed with status ${response.status}`);
  }

  logger.info({
    event: "webhook.retry.delivered",
    subscriptionId: sub.id,
    host: webhookHost(sub.url),
  });
}

/**
 * Walks each business with a Dimona employer id and re-checks recent
 * assignments. Records gaps for ops follow-up; production deployments wire
 * this to send to ON-call.
 */
export async function runDimonaReconcile(
  db: PrismaClient,
): Promise<{ businesses: number; gaps: number }> {
  const businesses = await db.business.findMany({
    where: { dimonaEmployerId: { not: null } },
    select: { id: true, ownerId: true },
  });
  const service = new DimonaService(db);
  const notifier = new NotificationService(db);
  const since = new Date(Date.now() - 7 * 86_400_000);
  let gaps = 0;
  for (const b of businesses) {
    const list = await service.reconcile(b.id, since);
    gaps += list.length;
    if (list.length > 0) {
      logger.warn({
        event: "jobs.dimona.gap",
        businessId: b.id,
        gaps: list.length,
      });
      // Surface the gap to the owner so missing declarations get fixed.
      await notifier.create({
        userId: b.ownerId,
        type: "DIMONA_GAP_DETECTED",
        title: "Dimona declarations missing",
        body: `${list.length} confirmed shift(s) have no matching Dimona declaration.`,
        payload: { businessId: b.id, count: list.length },
        url: "/settings",
      });
    }
  }
  return { businesses: businesses.length, gaps };
}

/**
 * Retries a failed Dimona IN/OUT/CANCEL declaration. Throws on failure so
 * pg-boss applies the configured retry backoff.
 */
export async function runDimonaDeclare(
  db: PrismaClient,
  job: DimonaDeclareJob,
): Promise<void> {
  const service = new DimonaService(db, getDimonaAdapter(), async () => {
    /* no nested retries from the worker */
  });

  if (job.action === "IN") {
    if (!job.declarationId) {
      await service.declareIn({ shiftId: job.shiftId, workerId: job.workerId });
      return;
    }
    const existing = await db.dimonaDeclaration.findUnique({
      where: { id: job.declarationId },
      include: { shift: { select: { businessId: true } } },
    });
    if (!existing?.shift) return;
    const result = await service.retryDeclareIn({
      declarationId: job.declarationId,
      businessId: existing.shift.businessId,
    });
    if (result?.status === "REJECTED") {
      throw new Error(result.errorMessage ?? "Dimona IN retry failed");
    }
    return;
  }

  if (job.action === "OUT") {
    const result = await service.declareOut({
      shiftId: job.shiftId,
      workerId: job.workerId,
    });
    if (result && !result.outDeclaredAt) {
      throw new Error(result.errorMessage ?? "Dimona OUT retry failed");
    }
    return;
  }

  if (job.action === "CANCEL") {
    const result = await service.cancel({
      shiftId: job.shiftId,
      workerId: job.workerId,
    });
    if (result?.status !== "CANCELLED") {
      throw new Error("Dimona CANCEL retry failed");
    }
  }
}

/**
 * GDPR hard-delete purge. Runs after the retention window: deletes the user's
 * uploaded documents from S3/MinIO (best-effort) and then anonymises their
 * personal data in the database. The S3 deletes are tolerant — a missing object
 * or unconfigured storage never blocks the DB anonymisation.
 */
export async function runGdprPurge(
  db: PrismaClient,
  job: GdprPurgeJob,
  fetcher: typeof fetch = fetch,
): Promise<{ documentsPurged: number; anonymized: boolean }> {
  let documentsPurged = 0;

  if (isStorageConfigured()) {
    const documents = await db.document.findMany({
      where: { userId: job.userId },
      select: { id: true, url: true },
    });
    const forcePathStyle = env.STORAGE_FORCE_PATH_STYLE === true;
    for (const document of documents) {
      const key = objectKeyFromUrl(document.url, {
        bucket: env.STORAGE_BUCKET!,
        forcePathStyle,
      });
      if (!key) continue;
      try {
        const ok = await deleteObject(
          {
            endpoint: env.STORAGE_ENDPOINT!,
            region: env.STORAGE_REGION!,
            bucket: env.STORAGE_BUCKET!,
            key,
            accessKeyId: env.STORAGE_ACCESS_KEY!,
            secretAccessKey: env.STORAGE_SECRET_KEY!,
            forcePathStyle,
          },
          fetcher,
        );
        if (ok) documentsPurged += 1;
      } catch (err) {
        logger.warn({
          event: "gdpr.purge.document.failed",
          documentId: document.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const service = new GdprService(db);
  const result = await service.purgeUser(job.userId);
  logger.info({
    event: "gdpr.purge.done",
    userId: job.userId,
    documentsPurged,
  });
  return { documentsPurged, anonymized: result.anonymized };
}
