import type { PrismaClient } from "@prisma/client";
import { publish as publishEvent } from "@/infrastructure/events/bus";
import { logger } from "@/infrastructure/logging/logger";
import { isWithinRadius } from "@/lib/geo";
import {
  parseLocationTokenId,
  verifyLocationToken,
} from "@/lib/location-token";
import { declareOutIfAuto } from "./dimona-hooks";
import { SchedulingRules } from "./scheduling-rules";

export class TimeClockService {
  private readonly rules: SchedulingRules;

  constructor(private readonly db: PrismaClient) {
    this.rules = new SchedulingRules(db);
  }

  async activeFor(userId: string) {
    return this.db.timeEntry.findFirst({
      where: { userId, clockOutAt: null },
      include: { shift: true },
      orderBy: { clockInAt: "desc" },
    });
  }

  async clockIn(input: {
    userId: string;
    shiftId: string | null;
    /** Captured browser coordinates, required when geofencing is enforced. */
    lat?: number;
    lng?: number;
    /** Set by the QR path: scanning a location's code proves presence. */
    skipGeofence?: boolean;
  }) {
    const open = await this.db.timeEntry.findFirst({
      where: { userId: input.userId, clockOutAt: null },
    });
    if (open) throw new Error("Already clocked in");

    const worker = await this.db.user.findUnique({
      where: { id: input.userId },
      select: { businessId: true },
    });
    let business: { requireSignedContract: boolean; enforceGeofence: boolean } | null =
      null;
    if (worker?.businessId) {
      business = await this.db.business.findUnique({
        where: { id: worker.businessId },
        select: { requireSignedContract: true, enforceGeofence: true },
      });
      if (business?.requireSignedContract) {
        const signed = await this.db.workerContract.findFirst({
          where: {
            userId: input.userId,
            businessId: worker.businessId,
            status: "SIGNED",
          },
        });
        if (!signed) {
          throw new Error("errors.contractRequired");
        }
      }
    }

    // A linked shift must belong to one of the worker's own assignments,
    // otherwise the entry would be attributed to a shift they never worked.
    let shift:
      | {
          startsAt: Date;
          endsAt: Date;
          location: {
            geofenceLat: unknown;
            geofenceLng: unknown;
            geofenceRadiusM: number | null;
          } | null;
        }
      | null = null;
    if (input.shiftId) {
      const assignment = await this.db.shiftAssignment.findFirst({
        where: { shiftId: input.shiftId, userId: input.userId },
      });
      if (!assignment) {
        throw new Error("Cannot clock in against a shift you are not assigned to");
      }
      shift = await this.db.shift.findUnique({
        where: { id: input.shiftId },
        select: {
          startsAt: true,
          endsAt: true,
          location: {
            select: {
              geofenceLat: true,
              geofenceLng: true,
              geofenceRadiusM: true,
            },
          },
        },
      });
    }

    // Eligibility gates (Phase F): required documents always apply to students;
    // minor / birth-date rules need the shift's time window.
    const docViolation = await this.rules.checkRequiredDocuments(input.userId, {
      startsAt: new Date(),
    });
    if (docViolation) throw new Error(docViolation.message);
    if (input.shiftId && shift) {
      const candidate = { startsAt: shift.startsAt, endsAt: shift.endsAt };
      const youth =
        (await this.rules.checkStudentBirthDateRequired(
          input.userId,
          candidate,
        )) ??
        (await this.rules.checkMinorDailyHours(input.userId, candidate)) ??
        (await this.rules.checkMinorNightWork(input.userId, candidate));
      if (youth) throw new Error(youth.message);
    }

    // Optional geofence enforcement: only when the business opted in and the
    // clocked shift's location actually defines a geofence.
    const geofence =
      shift?.location &&
      shift.location.geofenceLat != null &&
      shift.location.geofenceLng != null &&
      shift.location.geofenceRadiusM != null
        ? {
            lat: Number(shift.location.geofenceLat),
            lng: Number(shift.location.geofenceLng),
            radiusM: shift.location.geofenceRadiusM,
          }
        : null;
    if (!input.skipGeofence && business?.enforceGeofence && geofence) {
      if (input.lat == null || input.lng == null) {
        throw new Error("errors.geolocationRequired");
      }
      const within = isWithinRadius(
        { lat: geofence.lat, lng: geofence.lng },
        { lat: input.lat, lng: input.lng },
        geofence.radiusM,
      );
      if (!within) throw new Error("errors.outsideGeofence");
    }

    const entry = await this.db.timeEntry.create({
      data: {
        userId: input.userId,
        shiftId: input.shiftId ?? undefined,
        clockInAt: new Date(),
        clockInLat: input.lat ?? null,
        clockInLng: input.lng ?? null,
      },
    });

    await this.publishEntryCreated(input.userId);
    return entry;
  }

  /**
   * Clock in by scanning a location's signed QR code. The token proves which
   * location the worker is physically at, so geofence coordinate checks are
   * skipped. When the worker has an assigned shift at that location around now,
   * the entry is linked to it; otherwise it is a plain clock-in.
   */
  async clockInViaQr(input: { userId: string; token: string }) {
    const locationId = parseLocationTokenId(input.token);
    if (!locationId) throw new Error("errors.invalidQrToken");
    const location = await this.db.location.findUnique({
      where: { id: locationId },
      select: { id: true, qrSecret: true },
    });
    if (!location?.qrSecret || !verifyLocationToken(input.token, location.qrSecret)) {
      throw new Error("errors.invalidQrToken");
    }

    const now = Date.now();
    const window = 12 * 60 * 60 * 1000;
    const assignment = await this.db.shiftAssignment.findFirst({
      where: {
        userId: input.userId,
        shift: {
          locationId,
          startsAt: { lte: new Date(now + window) },
          endsAt: { gte: new Date(now - window) },
        },
      },
      include: { shift: { select: { id: true } } },
      orderBy: { shift: { startsAt: "asc" } },
    });

    return this.clockIn({
      userId: input.userId,
      shiftId: assignment?.shift.id ?? null,
      skipGeofence: true,
    });
  }

  async clockOut(input: {
    id: string;
    userId: string;
    breakMinutes: number;
    notes?: string;
  }) {
    const entry = await this.db.timeEntry.findFirst({
      where: { id: input.id, userId: input.userId, clockOutAt: null },
    });
    if (!entry) throw new Error("Open time entry not found");

    const clockOutAt = new Date();
    if (clockOutAt <= entry.clockInAt) {
      throw new Error("Clock-out must be after clock-in");
    }

    const grossMinutes = Math.round(
      (clockOutAt.getTime() - entry.clockInAt.getTime()) / 60000,
    );
    if (input.breakMinutes > grossMinutes) {
      throw new Error("Cannot record more break time than time worked");
    }

    const updated = await this.db.timeEntry.update({
      where: { id: entry.id },
      data: {
        clockOutAt,
        breakMinutes: input.breakMinutes,
        notes: input.notes,
      },
    });

    logger.info({ event: "timeClock.clockOut", entryId: entry.id });

    // Let managers know hours are awaiting review.
    const worker = await this.db.user.findUnique({
      where: { id: input.userId },
      select: { name: true, businessId: true },
    });
    if (worker?.businessId) {
      await this.notifyManagers(worker.businessId, {
        type: "TIME_ENTRY_SUBMITTED",
        title: "Hours submitted",
        body: `${worker.name} submitted hours for review.`,
        payload: { timeEntryId: entry.id, userId: input.userId },
        url: "/payroll/time-entries",
      });
      publishEvent(worker.businessId, {
        type: "time_entry.created",
        userId: input.userId,
      });
    }

    if (entry.shiftId) {
      await declareOutIfAuto(this.db, entry.shiftId, input.userId);
    }

    return updated;
  }

  async listPending(businessId: string, from?: Date, to?: Date) {
    return this.db.timeEntry.findMany({
      where: {
        status: "PENDING",
        clockOutAt: { not: null },
        user: { businessId },
        ...(from || to
          ? {
              clockInAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        shift: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            roleLabel: true,
          },
        },
      },
      orderBy: { clockInAt: "asc" },
    });
  }

  async listApproved(businessId: string, from?: Date, to?: Date) {
    return this.db.timeEntry.findMany({
      where: {
        approvedAt: { not: null },
        clockOutAt: { not: null },
        user: { businessId },
        ...(from || to
          ? {
              clockInAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        shift: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            roleLabel: true,
          },
        },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { approvedAt: "desc" },
    });
  }

  async listMine(userId: string, from: Date, to: Date) {
    return this.db.timeEntry.findMany({
      where: { userId, clockInAt: { gte: from, lte: to } },
      include: {
        shift: {
          select: { id: true, startsAt: true, endsAt: true, roleLabel: true },
        },
      },
      orderBy: { clockInAt: "desc" },
    });
  }

  async approveMany(input: {
    ids: string[];
    businessId: string;
    approverId: string;
  }) {
    // Only closed entries that are still PENDING are approvable — re-approving
    // or approving an open entry is a no-op.
    const entries = await this.db.timeEntry.findMany({
      where: {
        id: { in: input.ids },
        user: { businessId: input.businessId },
        clockOutAt: { not: null },
        status: "PENDING",
      },
      select: { id: true, userId: true, shiftId: true },
    });
    const validIds = entries.map((e) => e.id);
    if (validIds.length === 0) return { count: 0, warnings: [] };

    // Reconciliation: approving hours for a shift the worker was marked a
    // NO_SHOW on is contradictory. We don't block it (the manager may be
    // correcting the attendance), but we surface a warning per affected entry.
    const warnings = await this.collectNoShowWarnings(entries);

    const result = await this.db.timeEntry.updateMany({
      where: { id: { in: validIds } },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedById: input.approverId,
      },
    });

    for (const entry of entries) {
      await this.db.auditEvent.create({
        data: {
          userId: input.approverId,
          action: "TIME_ENTRY_APPROVED",
          entityType: "TimeEntry",
          entityId: entry.id,
        },
      });
      await this.db.notification.create({
        data: {
          userId: entry.userId,
          type: "TIME_ENTRY_APPROVED",
          title: "Hours approved",
          body: "Your submitted hours were approved.",
          payload: { timeEntryId: entry.id },
        },
      });
    }

    return { count: result.count, warnings };
  }

  /**
   * For a set of (closed) time entries, returns a warning per entry whose
   * linked shift assignment is marked NO_SHOW for that worker — used to flag
   * the attendance/payroll contradiction without blocking approval.
   */
  private async collectNoShowWarnings(
    entries: Array<{ id: string; userId: string; shiftId: string | null }>,
  ): Promise<Array<{ timeEntryId: string; code: string }>> {
    const withShift = entries.filter(
      (e): e is { id: string; userId: string; shiftId: string } =>
        typeof e.shiftId === "string" && e.shiftId.length > 0,
    );
    if (withShift.length === 0) return [];

    const noShows = await this.db.shiftAssignment.findMany({
      where: {
        attendance: "NO_SHOW",
        OR: withShift.map((e) => ({ userId: e.userId, shiftId: e.shiftId })),
      },
      select: { userId: true, shiftId: true },
    });
    if (noShows.length === 0) return [];

    const flagged = new Set(noShows.map((a) => `${a.userId}:${a.shiftId}`));
    return withShift
      .filter((e) => flagged.has(`${e.userId}:${e.shiftId}`))
      .map((e) => ({ timeEntryId: e.id, code: "errors.timeEntryShiftNoShow" }));
  }

  async rejectMany(input: {
    ids: string[];
    businessId: string;
    reviewerId: string;
    reason: string;
  }) {
    // A reason is mandatory so every rejection is auditable, mirroring the
    // mandatory reason on time-entry corrections.
    const reason = input.reason?.trim();
    if (!reason) throw new Error("errors.rejectReasonRequired");

    const entries = await this.db.timeEntry.findMany({
      where: {
        id: { in: input.ids },
        user: { businessId: input.businessId },
        clockOutAt: { not: null },
        status: { not: "REJECTED" },
      },
      select: { id: true, userId: true },
    });
    const validIds = entries.map((e) => e.id);
    if (validIds.length === 0) return { count: 0 };

    const result = await this.db.timeEntry.updateMany({
      where: { id: { in: validIds } },
      data: {
        status: "REJECTED",
        approvedAt: null,
        approvedById: input.reviewerId,
        reviewNote: reason,
      },
    });

    for (const entry of entries) {
      await this.db.auditEvent.create({
        data: {
          userId: input.reviewerId,
          action: "TIME_ENTRY_REJECTED",
          entityType: "TimeEntry",
          entityId: entry.id,
          metadata: { reason },
        },
      });
      await this.db.notification.create({
        data: {
          userId: entry.userId,
          type: "TIME_ENTRY_REJECTED",
          title: "Hours rejected",
          body: `Your submitted hours were rejected: ${reason}`,
          payload: { timeEntryId: entry.id },
        },
      });
    }

    return { count: result.count };
  }

  /**
   * Corrects a time entry. Time registration is immutable: a non-empty reason
   * is mandatory and, BEFORE the values change, an append-only
   * {@link TimeEntryCorrection} captures the prior + new snapshot. If the entry
   * had already been APPROVED it is re-opened to PENDING (approval cleared) and
   * the worker is notified that their approved hours were corrected.
   */
  async updateEntry(input: {
    id: string;
    businessId: string;
    reviewerId: string;
    reason: string;
    clockInAt?: Date;
    clockOutAt?: Date;
    breakMinutes?: number;
    notes?: string | null;
  }) {
    const reason = input.reason?.trim();
    if (!reason) throw new Error("errors.correctionReasonRequired");

    const entry = await this.db.timeEntry.findFirst({
      where: { id: input.id, user: { businessId: input.businessId } },
    });
    if (!entry) throw new Error("Time entry not found");

    const clockInAt = input.clockInAt ?? entry.clockInAt;
    const clockOutAt =
      input.clockOutAt !== undefined ? input.clockOutAt : entry.clockOutAt;
    const breakMinutes =
      input.breakMinutes !== undefined ? input.breakMinutes : entry.breakMinutes;

    if (clockOutAt && clockOutAt <= clockInAt) {
      throw new Error("Clock-out must be after clock-in");
    }
    if (clockOutAt) {
      const grossMinutes = Math.round(
        (clockOutAt.getTime() - clockInAt.getTime()) / 60000,
      );
      if (breakMinutes > grossMinutes) {
        throw new Error("Cannot record more break time than time worked");
      }
    }

    // Immutable before/after snapshot is written FIRST, so the history is
    // preserved even if the subsequent update somehow fails.
    await this.db.timeEntryCorrection.create({
      data: {
        timeEntryId: entry.id,
        editedById: input.reviewerId,
        reason,
        prevClockInAt: entry.clockInAt,
        prevClockOutAt: entry.clockOutAt,
        prevBreakMinutes: entry.breakMinutes,
        newClockInAt: clockInAt,
        newClockOutAt: clockOutAt ?? null,
        newBreakMinutes: breakMinutes,
      },
    });

    const wasApproved = entry.status === "APPROVED";
    const updated = await this.db.timeEntry.update({
      where: { id: entry.id },
      data: {
        clockInAt: input.clockInAt,
        clockOutAt: input.clockOutAt,
        breakMinutes: input.breakMinutes,
        notes: input.notes === undefined ? undefined : input.notes,
        // Editing approved hours re-opens them for review.
        ...(wasApproved
          ? { status: "PENDING", approvedAt: null, approvedById: null }
          : {}),
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.reviewerId,
        action: "TIME_ENTRY_EDITED",
        entityType: "TimeEntry",
        entityId: entry.id,
        metadata: {
          reason,
          prevClockInAt: entry.clockInAt.toISOString(),
          prevClockOutAt: entry.clockOutAt ? entry.clockOutAt.toISOString() : null,
          prevBreakMinutes: entry.breakMinutes,
          clockInAt: clockInAt.toISOString(),
          clockOutAt: clockOutAt ? clockOutAt.toISOString() : null,
          breakMinutes,
          reopened: wasApproved,
        },
      },
    });

    if (wasApproved) {
      await this.db.notification.create({
        data: {
          userId: entry.userId,
          type: "TIME_ENTRY_CORRECTED",
          title: "Approved hours corrected",
          body: `Your approved hours were corrected and are pending review again: ${reason}`,
          payload: { timeEntryId: entry.id },
        },
      });
    }

    return updated;
  }

  /**
   * Append-only correction history for one time entry, newest first. Scoped to
   * the business so a manager can only read corrections for their own entries.
   */
  async listCorrections(input: { timeEntryId: string; businessId: string }) {
    const entry = await this.db.timeEntry.findFirst({
      where: { id: input.timeEntryId, user: { businessId: input.businessId } },
      select: { id: true },
    });
    if (!entry) throw new Error("Time entry not found");
    return this.db.timeEntryCorrection.findMany({
      where: { timeEntryId: input.timeEntryId },
      orderBy: { editedAt: "desc" },
    });
  }

  /**
   * Sums approved worked minutes for a user inside a window, converted to
   * decimal hours. Only APPROVED, closed entries count toward worked hours.
   */
  async aggregateWorkedHours(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const entries = await this.db.timeEntry.findMany({
      where: {
        userId,
        status: "APPROVED",
        clockOutAt: { not: null },
        clockInAt: { gte: from, lte: to },
      },
      select: { clockInAt: true, clockOutAt: true, breakMinutes: true },
    });
    const minutes = entries.reduce(
      (sum, e) => sum + TimeClockService.workedMinutes(e),
      0,
    );
    return Math.round((minutes / 60) * 100) / 100;
  }

  /**
   * Computes worked minutes for a single entry, deducting breaks. Returns 0
   * for entries that have not been clocked out yet.
   */
  static workedMinutes(entry: {
    clockInAt: Date;
    clockOutAt: Date | null;
    breakMinutes: number;
  }): number {
    if (!entry.clockOutAt) return 0;
    const total = Math.round(
      (entry.clockOutAt.getTime() - entry.clockInAt.getTime()) / 60000,
    );
    return Math.max(0, total - entry.breakMinutes);
  }

  private async publishEntryCreated(userId: string) {
    const worker = await this.db.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (worker?.businessId) {
      publishEvent(worker.businessId, { type: "time_entry.created", userId });
    }
  }

  /**
   * Fans an in-app notification out to the owner and every active manager of a
   * business. Used for review queues that any manager can action.
   */
  private async notifyManagers(
    businessId: string,
    notification: {
      type: "TIME_ENTRY_SUBMITTED";
      title: string;
      body: string;
      payload?: Record<string, unknown>;
      url?: string;
    },
  ) {
    const recipients = await this.db.user.findMany({
      where: {
        businessId,
        role: { in: ["OWNER", "MANAGER"] },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    for (const recipient of recipients) {
      await this.db.notification.create({
        data: {
          userId: recipient.id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          payload: notification.payload as object | undefined,
        },
      });
    }
  }
}
