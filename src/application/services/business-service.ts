import type { PrismaClient } from "@prisma/client";
import { encryptString } from "@/infrastructure/dimona/crypto";

/**
 * Read-side service for the current business. We return the workers list as
 * a side-projection because the calendar UI needs it to render owner-facing
 * filters and direct-assign dialogs; pulling it from a separate endpoint
 * would mean two round-trips on every page paint.
 */
export class BusinessService {
  constructor(private readonly db: PrismaClient) {}

  async get(businessId: string) {
    return this.db.business.findUnique({
      where: { id: businessId },
      include: {
        workers: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * Owner-facing settings projection. Never returns the encrypted Dimona
   * credentials blob — only whether one is configured.
   */
  async getSettings(businessId: string) {
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        timezone: true,
        weekStartsOn: true,
        dimonaEmployerId: true,
        dimonaCredentials: true,
        requireSignedContract: true,
        addressLine: true,
        postalCode: true,
        city: true,
        cbeNumber: true,
        studentQuotaHardStop: true,
        studentQuotaHardStopBufferHours: true,
        requireStudentAttestation: true,
        attestationMaxAgeDays: true,
      },
    });
    if (!business) throw new Error("Business not found");
    const { dimonaCredentials, ...rest } = business;
    return { ...rest, dimonaConfigured: Boolean(dimonaCredentials) };
  }

  /**
   * Updates the employer identification used by contracts (`employerSnapshot`)
   * and Dimona declarations: postal address and CBE / enterprise number.
   */
  async updateEmployerProfile(input: {
    businessId: string;
    actorId: string;
    addressLine: string | null;
    postalCode: string | null;
    city: string | null;
    cbeNumber: string | null;
  }) {
    const updated = await this.db.business.update({
      where: { id: input.businessId },
      data: {
        addressLine: input.addressLine,
        postalCode: input.postalCode,
        city: input.city,
        cbeNumber: input.cbeNumber,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.actorId,
        action: "BUSINESS_SETTINGS_UPDATED",
        entityType: "Business",
        entityId: input.businessId,
        metadata: { employerProfileUpdated: true },
      },
    });

    return {
      addressLine: updated.addressLine,
      postalCode: updated.postalCode,
      city: updated.city,
      cbeNumber: updated.cbeNumber,
    };
  }

  /**
   * Toggles the student-worker 650h quota hard stop and its safety buffer. The
   * buffer (hours) is subtracted from the remaining quota before the hard stop
   * trips, so a business can stop scheduling students a configurable margin
   * before the 650h cap is actually reached.
   */
  async updateStudentQuotaPolicy(input: {
    businessId: string;
    actorId: string;
    studentQuotaHardStop: boolean;
    studentQuotaHardStopBufferHours: number;
  }) {
    const updated = await this.db.business.update({
      where: { id: input.businessId },
      data: {
        studentQuotaHardStop: input.studentQuotaHardStop,
        studentQuotaHardStopBufferHours: input.studentQuotaHardStopBufferHours,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.actorId,
        action: "BUSINESS_SETTINGS_UPDATED",
        entityType: "Business",
        entityId: input.businessId,
        metadata: {
          studentQuotaHardStop: input.studentQuotaHardStop,
          studentQuotaHardStopBufferHours:
            input.studentQuotaHardStopBufferHours,
        },
      },
    });

    return {
      studentQuotaHardStop: updated.studentQuotaHardStop,
      studentQuotaHardStopBufferHours: updated.studentQuotaHardStopBufferHours,
    };
  }

  /**
   * Toggles the Student@Work attestation requirement and the maximum age (days)
   * after which an attestation counts as stale. When enabled, a JOBSTUDENT
   * cannot be assigned without a fresh attestation on file.
   */
  async updateStudentAttestationPolicy(input: {
    businessId: string;
    actorId: string;
    requireStudentAttestation: boolean;
    attestationMaxAgeDays: number;
  }) {
    const updated = await this.db.business.update({
      where: { id: input.businessId },
      data: {
        requireStudentAttestation: input.requireStudentAttestation,
        attestationMaxAgeDays: input.attestationMaxAgeDays,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.actorId,
        action: "BUSINESS_SETTINGS_UPDATED",
        entityType: "Business",
        entityId: input.businessId,
        metadata: {
          requireStudentAttestation: input.requireStudentAttestation,
          attestationMaxAgeDays: input.attestationMaxAgeDays,
        },
      },
    });

    return {
      requireStudentAttestation: updated.requireStudentAttestation,
      attestationMaxAgeDays: updated.attestationMaxAgeDays,
    };
  }

  /**
   * Updates Dimona integration settings. `dimonaCredentials` is the plaintext
   * secret (e.g. a JSON `{ token, baseUrl }`); it is encrypted at rest with the
   * AES-256-GCM helper. Passing `null` clears it, `undefined` leaves it as-is.
   */
  async updateDimonaSettings(input: {
    businessId: string;
    actorId: string;
    dimonaEmployerId: string | null;
    dimonaCredentials?: string | null;
  }) {
    const data: {
      dimonaEmployerId: string | null;
      dimonaCredentials?: string | null;
    } = { dimonaEmployerId: input.dimonaEmployerId };
    if (input.dimonaCredentials !== undefined) {
      data.dimonaCredentials = input.dimonaCredentials
        ? encryptString(input.dimonaCredentials)
        : null;
    }

    const updated = await this.db.business.update({
      where: { id: input.businessId },
      data,
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.actorId,
        action: "BUSINESS_SETTINGS_UPDATED",
        entityType: "Business",
        entityId: input.businessId,
        metadata: {
          dimonaEmployerIdSet: Boolean(input.dimonaEmployerId),
          credentialsChanged: input.dimonaCredentials !== undefined,
        },
      },
    });

    return {
      dimonaEmployerId: updated.dimonaEmployerId,
      dimonaConfigured: Boolean(updated.dimonaCredentials),
    };
  }

  async updateContractPolicy(input: {
    businessId: string;
    actorId: string;
    requireSignedContract: boolean;
  }) {
    const updated = await this.db.business.update({
      where: { id: input.businessId },
      data: { requireSignedContract: input.requireSignedContract },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.actorId,
        action: "BUSINESS_SETTINGS_UPDATED",
        entityType: "Business",
        entityId: input.businessId,
        metadata: { requireSignedContract: input.requireSignedContract },
      },
    });

    return { requireSignedContract: updated.requireSignedContract };
  }
}
