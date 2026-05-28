import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { NotificationService } from "./notification-service";
import { WebhookService } from "./webhook-service";

/**
 * Lifecycle service for shifts: create, update, delete, publish. Read
 * projections live in `ShiftReadModel` and assignment-time logic lives in
 * `ShiftAssignmentService` — keeping each responsibility narrow so this file
 * stays focused on "the shift row itself".
 */
export class ShiftService {
  private readonly notifications: NotificationService;

  constructor(private readonly db: PrismaClient) {
    this.notifications = new NotificationService(db);
  }

  async create(input: {
    businessId: string;
    ownerId: string;
    startsAt: Date;
    endsAt: Date;
    roleLabel: string;
    requiredSpots: number;
    notes?: string;
    requiredSkillId?: string | null;
    /** When omitted, the shift is created as a draft (publishedAt = null). */
    publish?: boolean;
  }) {
    if (input.endsAt <= input.startsAt) {
      throw new Error("End time must be after start time");
    }
    if (input.requiredSpots < 1) {
      throw new Error("Required spots must be at least 1");
    }

    const shift = await this.db.shift.create({
      data: {
        businessId: input.businessId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        roleLabel: input.roleLabel,
        requiredSpots: input.requiredSpots,
        notes: input.notes,
        requiredSkillId: input.requiredSkillId ?? null,
        publishedAt: input.publish ? new Date() : null,
        publishedById: input.publish ? input.ownerId : null,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_CREATED",
        entityType: "Shift",
        entityId: shift.id,
      },
    });

    logger.info({ event: "shift.created", shiftId: shift.id, draft: !input.publish });
    publishEvent(input.businessId, { type: "shift.updated", shiftId: shift.id });
    void new WebhookService(this.db).fan(
      "shift.created",
      { shiftId: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt },
      input.businessId,
    );

    return shift;
  }

  /**
   * Publishes a batch of shifts. Only previously-draft shifts in the given
   * business are touched; already-published ones are skipped. Returns the
   * number of shifts published.
   */
  async publish(input: { ids: string[]; businessId: string; ownerId: string }) {
    if (input.ids.length === 0) return { count: 0 };
    const result = await this.db.shift.updateMany({
      where: {
        id: { in: input.ids },
        businessId: input.businessId,
        publishedAt: null,
      },
      data: { publishedAt: new Date(), publishedById: input.ownerId },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_PUBLISHED",
        entityType: "Shift",
        entityId: input.ids[0] ?? "batch",
        metadata: { ids: input.ids, count: result.count },
      },
    });

    logger.info({ event: "shift.published", count: result.count });
    publishEvent(input.businessId, { type: "shift.updated", shiftId: "batch" });
    return result;
  }

  async publishRange(input: {
    businessId: string;
    ownerId: string;
    from: Date;
    to: Date;
  }) {
    const result = await this.db.shift.updateMany({
      where: {
        businessId: input.businessId,
        publishedAt: null,
        startsAt: { gte: input.from, lt: input.to },
      },
      data: { publishedAt: new Date(), publishedById: input.ownerId },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_PUBLISHED",
        entityType: "Shift",
        entityId: "range",
        metadata: { from: input.from, to: input.to, count: result.count },
      },
    });

    return result;
  }

  /**
   * Creates a series of weekly-recurring shifts starting from `startsAt` until
   * `repeatUntil` inclusive. Each occurrence is a regular `Shift` row; we keep
   * recurrence simple (weekly, fixed duration) on purpose for MVP.
   */
  async createRecurring(input: {
    businessId: string;
    ownerId: string;
    startsAt: Date;
    endsAt: Date;
    roleLabel: string;
    requiredSpots: number;
    notes?: string;
    repeatUntil: Date;
  }) {
    if (input.repeatUntil < input.startsAt) {
      throw new Error("Repeat-until must be after the first occurrence");
    }
    const created = [];
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    let cursorStart = input.startsAt.getTime();
    let cursorEnd = input.endsAt.getTime();
    const stop = input.repeatUntil.getTime();
    while (cursorStart <= stop) {
      const shift = await this.create({
        businessId: input.businessId,
        ownerId: input.ownerId,
        startsAt: new Date(cursorStart),
        endsAt: new Date(cursorEnd),
        roleLabel: input.roleLabel,
        requiredSpots: input.requiredSpots,
        notes: input.notes,
      });
      created.push(shift);
      cursorStart += ONE_WEEK;
      cursorEnd += ONE_WEEK;
    }
    return created;
  }

  async update(input: {
    id: string;
    businessId: string;
    ownerId: string;
    startsAt?: Date;
    endsAt?: Date;
    roleLabel?: string;
    requiredSpots?: number;
    notes?: string | null;
  }) {
    const existing = await this.db.shift.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!existing) {
      throw new Error("Shift not found");
    }

    // Only fields explicitly passed in `input` can have changed — an
    // `undefined` value means "leave as-is", so it must not count as a change.
    const startChanged =
      input.startsAt !== undefined &&
      input.startsAt.getTime() !== existing.startsAt.getTime();
    const endChanged =
      input.endsAt !== undefined &&
      input.endsAt.getTime() !== existing.endsAt.getTime();
    const roleChanged =
      input.roleLabel !== undefined && input.roleLabel !== existing.roleLabel;
    const needsReconfirm = startChanged || endChanged || roleChanged;

    const shift = await this.db.shift.update({
      where: { id: input.id },
      data: {
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        roleLabel: input.roleLabel,
        requiredSpots: input.requiredSpots,
        notes: input.notes,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_UPDATED",
        entityType: "Shift",
        entityId: shift.id,
      },
    });

    if (needsReconfirm) {
      await this.requestReconfirmations({
        shift,
        businessId: input.businessId,
        ownerId: input.ownerId,
      });
    }

    return shift;
  }

  /**
   * Drops every currently-CONFIRMED assignment on a rescheduled shift back to
   * PENDING_RECONFIRMATION and pings each worker. The owner does not re-approve;
   * the worker either re-confirms the new time or declines (freeing the spot).
   * The mirrored `ShiftSubscription` rows are intentionally left untouched —
   * `ShiftAssignment.status` is the single source of truth for reconfirmation.
   */
  private async requestReconfirmations(input: {
    shift: { id: string; startsAt: Date; endsAt: Date; roleLabel: string };
    businessId: string;
    ownerId: string;
  }) {
    const assignments =
      (await this.db.shiftAssignment.findMany({
        where: { shiftId: input.shift.id, status: "CONFIRMED" },
      })) ?? [];
    if (assignments.length === 0) return;

    const dateLabel = input.shift.startsAt
      .toISOString()
      .slice(0, 16)
      .replace("T", " ");

    for (const assignment of assignments) {
      await this.db.shiftAssignment.update({
        where: { id: assignment.id },
        data: { status: "PENDING_RECONFIRMATION" },
      });

      await this.notifications.create({
        userId: assignment.userId,
        type: "SHIFT_RESCHEDULED",
        title: "A shift was rescheduled",
        body: `${input.shift.roleLabel} is now ${dateLabel}. Please reconfirm you can still make it.`,
        payload: { shiftId: input.shift.id, kind: "reschedule" },
        url: `/applications`,
      });

      await this.db.auditEvent.create({
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
  }

  async delete(input: { id: string; businessId: string; ownerId: string }) {
    const existing = await this.db.shift.findFirst({
      where: { id: input.id, businessId: input.businessId },
      include: { subscriptions: { where: { status: "PENDING" } } },
    });
    if (!existing) {
      throw new Error("Shift not found");
    }

    const shift = await this.db.shift.update({
      where: { id: input.id },
      data: { status: "CANCELLED" },
    });

    for (const sub of existing.subscriptions) {
      await this.db.notification.create({
        data: {
          userId: sub.userId,
          type: "SHIFT_CANCELLED",
          title: "Shift cancelled",
          body: `The shift ${existing.roleLabel} was cancelled.`,
          payload: { shiftId: existing.id },
        },
      });
    }

    await this.db.auditEvent.create({
      data: {
        userId: input.ownerId,
        action: "SHIFT_DELETED",
        entityType: "Shift",
        entityId: shift.id,
      },
    });

    return shift;
  }
}
