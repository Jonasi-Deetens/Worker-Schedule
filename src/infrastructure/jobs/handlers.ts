import type { PrismaClient } from "@prisma/client";
import { AvailabilityService } from "@/application/services/availability-service";
import { DimonaService } from "@/application/services/dimona-service";
import { NotificationService } from "@/application/services/notification-service";
import { logger } from "@/infrastructure/logging/logger";

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
      assignments: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  const notifier = new NotificationService(db);
  let recipients = 0;
  for (const shift of shifts) {
    for (const a of shift.assignments) {
      await notifier.create({
        userId: a.userId,
        type: "SHIFT_REMINDER_24H",
        title: "Shift in 24 hours",
        body: `${shift.roleLabel} at ${shift.startsAt.toISOString().slice(11, 16)}`,
        payload: { shiftId: shift.id },
        url: "/calendar",
      });
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
 * Walks each business with a Dimona employer id and re-checks recent
 * assignments. Records gaps for ops follow-up; production deployments wire
 * this to send to ON-call.
 */
export async function runDimonaReconcile(
  db: PrismaClient,
): Promise<{ businesses: number; gaps: number }> {
  const businesses = await db.business.findMany({
    where: { dimonaEmployerId: { not: null } },
    select: { id: true },
  });
  const service = new DimonaService(db);
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
    }
  }
  return { businesses: businesses.length, gaps };
}
