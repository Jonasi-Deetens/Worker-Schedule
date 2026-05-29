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
      },
    });
    if (!business) throw new Error("Business not found");
    const { dimonaCredentials, ...rest } = business;
    return { ...rest, dimonaConfigured: Boolean(dimonaCredentials) };
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
}
