import type { PrismaClient } from "@prisma/client";

/**
 * Memberships allow one user to belong to multiple businesses. The legacy
 * `User.businessId` column is still in place for backwards compatibility; new
 * code should prefer the membership table.
 */
export class MembershipService {
  constructor(private readonly db: PrismaClient) {}

  /** All active businesses a user can switch to. Includes their primary one. */
  async listForUser(userId: string) {
    const memberships = await this.db.membership.findMany({
      where: { userId, status: "ACTIVE" },
      include: { business: { select: { id: true, name: true } } },
      orderBy: { business: { name: "asc" } },
    });
    return memberships.map((m) => ({
      id: m.id,
      role: m.role,
      businessId: m.businessId,
      businessName: m.business.name,
    }));
  }

  /** True when the user has any membership in the given business. */
  async assertActive(userId: string, businessId: string) {
    const membership = await this.db.membership.findFirst({
      where: { userId, businessId, status: "ACTIVE" },
    });
    if (!membership) {
      throw new Error("User has no active membership in this business");
    }
    return membership;
  }
}
