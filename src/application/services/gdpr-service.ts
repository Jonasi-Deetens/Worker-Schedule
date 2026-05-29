import type { PrismaClient } from "@prisma/client";
import { decryptPiiNullable } from "@/infrastructure/crypto/pii";
import {
  defaultEnqueueGdprPurge,
  GDPR_RETENTION_DAYS,
  type GdprPurgeEnqueue,
} from "./gdpr-purge-job";

/**
 * Implements the GDPR self-service surface: full data export, soft delete, a
 * delayed hard-delete request, and the irreversible purge that the background
 * job runs after the retention window.
 */
export class GdprService {
  constructor(
    private readonly db: PrismaClient,
    /** Injectable so unit tests never open a Postgres connection. */
    private readonly enqueuePurge: GdprPurgeEnqueue = defaultEnqueueGdprPurge,
  ) {}

  /**
   * Returns a JSON-serialisable snapshot of everything we hold for the user,
   * including contracts, Dimona (STU) declarations, the student quota ledger,
   * hour corrections and the user's own audit events. The data subject's NISS
   * is decrypted (it is *their* number — GDPR-appropriate to return), while
   * secrets (`passwordHash`, `twoFactorSecret`) are always stripped and no
   * other person's data is included.
   */
  async exportUser(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        availabilities: true,
        availabilityTemplates: true,
        subscriptions: true,
        assignments: { include: { shift: true } },
        notifications: true,
        timeOffRequests: true,
        timeEntries: true,
        skills: true,
        documents: true,
        workerContracts: true,
        stuDeclarations: true,
        studentQuotas: true,
        auditEvents: true,
      },
    });
    if (!user) throw new Error("User not found");

    // DimonaDeclaration is linked by `workerId` (no User relation), and hour
    // corrections by the corrected entry — fetch both for this subject only.
    const [dimonaDeclarations, timeEntryCorrections] = await Promise.all([
      this.db.dimonaDeclaration.findMany({ where: { workerId: userId } }),
      this.db.timeEntryCorrection.findMany({
        where: { timeEntry: { userId } },
      }),
    ]);

    const {
      passwordHash: _ph,
      twoFactorSecret: _tfa,
      stuDeclarations,
      studentQuotas,
      ...safe
    } = user;

    return {
      ...safe,
      nationalNumber: decryptPiiNullable(safe.nationalNumber),
      dimonaStuDeclarations: stuDeclarations,
      studentQuota: studentQuotas,
      dimonaDeclarations,
      timeEntryCorrections,
    };
  }

  /**
   * Soft-deletes a user: sets ARCHIVED status and removes assignments going
   * forward. Owners cannot be soft-deleted via this entry point.
   */
  async softDelete(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");
    if (user.role === "OWNER") {
      throw new Error("Owners must transfer ownership before deletion");
    }
    const now = new Date();
    const futureAssignments = await this.db.shiftAssignment.findMany({
      where: { userId, shift: { startsAt: { gte: now } } },
      select: { id: true },
    });
    await this.db.$transaction([
      this.db.user.update({
        where: { id: userId },
        data: {
          status: "ARCHIVED",
          notificationPrefs: { deletedAt: now.toISOString() } as object,
        },
      }),
      this.db.shiftAssignment.deleteMany({
        where: { id: { in: futureAssignments.map((a) => a.id) } },
      }),
    ]);
    return { deletedAssignments: futureAssignments.length };
  }

  /**
   * Hard-delete request: soft-deletes immediately, records a
   * `GDPR_DELETE_REQUESTED` audit event, and enqueues the irreversible purge to
   * run after the {@link GDPR_RETENTION_DAYS} safety window.
   */
  async requestDeletion(userId: string) {
    const result = await this.softDelete(userId);
    await this.db.auditEvent.create({
      data: {
        userId,
        action: "GDPR_DELETE_REQUESTED",
        entityType: "User",
        entityId: userId,
        metadata: { retentionDays: GDPR_RETENTION_DAYS },
      },
    });
    await this.enqueuePurge({ userId });
    return { ...result, retentionDays: GDPR_RETENTION_DAYS };
  }

  /**
   * Irreversible anonymisation of the user's personal data, run by the purge
   * job after S3 documents have been deleted. We anonymise rather than hard-row
   * delete so legally-required payroll history keeps referential integrity, but
   * every piece of PII is overwritten. Records a `GDPR_PURGED` audit event.
   */
  async purgeUser(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");
    if (user.role === "OWNER") {
      throw new Error("Owners must transfer ownership before deletion");
    }

    await this.db.document.deleteMany({ where: { userId } });
    await this.db.pushSubscription.deleteMany({ where: { userId } });
    await this.db.availability.deleteMany({ where: { userId } });

    await this.db.user.update({
      where: { id: userId },
      data: {
        name: "Deleted user",
        email: `deleted+${userId}@deleted.invalid`,
        passwordHash: "",
        twoFactorSecret: null,
        phone: null,
        avatarUrl: null,
        nationalNumber: null,
        addressLine: null,
        postalCode: null,
        city: null,
        iban: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        birthDate: null,
        notificationPrefs: { purgedAt: new Date().toISOString() } as object,
        status: "ARCHIVED",
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: null,
        action: "GDPR_PURGED",
        entityType: "User",
        entityId: userId,
      },
    });

    return { anonymized: true };
  }
}
