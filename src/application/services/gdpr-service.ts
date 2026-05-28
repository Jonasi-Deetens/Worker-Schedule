import type { PrismaClient } from "@prisma/client";

/**
 * Implements the GDPR self-service surface: full data export + soft delete.
 * Soft delete suspends the user and marks them for hard-delete in 90 days;
 * actually pruning the row happens via a follow-up reconciliation job.
 */
export class GdprService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Returns a JSON-serialisable snapshot of everything we hold for the user.
   * Sensitive fields like password hash and 2FA secrets are redacted.
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
      },
    });
    if (!user) throw new Error("User not found");
    const { passwordHash: _ph, twoFactorSecret: _tfa, ...safe } = user;
    return safe;
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
}
