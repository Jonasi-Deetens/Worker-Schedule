import type { PrismaClient } from "@prisma/client";

export interface AuditSearchInput {
  businessId: string;
  q?: string;
  action?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  take: number;
}

/**
 * Read-side projection over the audit log. Scope is always "members of one
 * business" (legacy `businessId` + new owned-business backlink) so cross-
 * business leakage is impossible regardless of how the caller filters.
 */
export class AuditService {
  constructor(private readonly db: PrismaClient) {}

  private async memberIds(businessId: string): Promise<string[]> {
    const members = await this.db.user.findMany({
      where: {
        OR: [
          { businessId },
          { ownedBusiness: { id: businessId } },
        ],
      },
      select: { id: true },
    });
    return members.map((m) => m.id);
  }

  async search(input: AuditSearchInput) {
    const ids = await this.memberIds(input.businessId);
    const where: Record<string, unknown> = {
      userId: { in: ids },
    };
    if (input.action) where.action = input.action;
    if (input.userId) where.userId = input.userId;
    if (input.from || input.to) {
      where.createdAt = {
        ...(input.from ? { gte: input.from } : {}),
        ...(input.to ? { lt: input.to } : {}),
      };
    }
    if (input.q) {
      const q = input.q;
      where.OR = [
        { entityId: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
      ];
    }
    const events = await this.db.auditEvent.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: input.take + 1,
      ...(input.cursor
        ? { cursor: { id: input.cursor }, skip: 1 }
        : {}),
    });
    let nextCursor: string | null = null;
    if (events.length > input.take) {
      const last = events.pop();
      nextCursor = last ? last.id : null;
    }
    return { events, nextCursor };
  }

  /** Distinct list of business members for the user filter dropdown. */
  async members(businessId: string) {
    return this.db.user.findMany({
      where: {
        OR: [
          { businessId },
          { ownedBusiness: { id: businessId } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }
}
