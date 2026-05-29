import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { NotificationService } from "./notification-service";

/**
 * Shared reschedule reconfirmation flow.
 *
 * When a shift's time (or role) changes, every currently-CONFIRMED assignment
 * is dropped back to PENDING_RECONFIRMATION and the worker is pinged to
 * re-confirm (or decline) the new slot. Extracted into a single function so
 * every path that mutates a shift's time — single-shift update, calendar
 * drag-reschedule, and bulk reschedule — enforces the exact same behaviour and
 * cannot silently keep stale confirmations.
 *
 * Returns the number of assignments moved to PENDING_RECONFIRMATION.
 */
export async function requestShiftReconfirmations(
  db: PrismaClient,
  input: {
    shift: { id: string; startsAt: Date; endsAt: Date; roleLabel: string };
    businessId: string;
    ownerId: string;
    notifications?: NotificationService;
  },
): Promise<number> {
  const notifications = input.notifications ?? new NotificationService(db);

  const assignments =
    (await db.shiftAssignment.findMany({
      where: { shiftId: input.shift.id, status: "CONFIRMED" },
    })) ?? [];
  if (assignments.length === 0) return 0;

  const dateLabel = input.shift.startsAt
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");

  for (const assignment of assignments) {
    await db.shiftAssignment.update({
      where: { id: assignment.id },
      data: { status: "PENDING_RECONFIRMATION" },
    });

    await notifications.create({
      userId: assignment.userId,
      type: "SHIFT_RESCHEDULED",
      title: "A shift was rescheduled",
      body: `${input.shift.roleLabel} is now ${dateLabel}. Please reconfirm you can still make it.`,
      payload: { shiftId: input.shift.id, kind: "reschedule" },
      url: `/applications`,
    });

    await db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_RESCHEDULE_PENDING",
        entityType: "Shift",
        entityId: input.shift.id,
        metadata: { workerId: assignment.userId },
      },
    });

    publishEvent(input.businessId, {
      type: "assignment.changed",
      shiftId: input.shift.id,
    });
  }

  logger.info({
    event: "shift.reschedule.reconfirmRequested",
    shiftId: input.shift.id,
    count: assignments.length,
  });

  return assignments.length;
}
