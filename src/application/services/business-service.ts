import type { PrismaClient } from "@prisma/client";

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
}
