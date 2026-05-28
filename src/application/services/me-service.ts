import { compare, hash } from "bcryptjs";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { signCalendarToken } from "@/lib/ical";

export interface MeUpdateProfileInput {
  name?: string;
  phone?: string | null;
  locale?: "en" | "nl" | "fr";
  avatarUrl?: string | null;
  notificationPrefs?: unknown;
}

/**
 * "Me" reads and writes the row for the calling user — profile fields,
 * password, dashboard projection, and the personal ICS feed URL. These all
 * sit under a single service because they share the same authorization
 * context (the user themselves) and are independent of the business model.
 */
export class MeService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Single round-trip used by the mobile worker home screen. Bundles the
   * next shift, open broadcasts, pending application count, unread
   * notifications and this-week scheduled hours so the home view paints in
   * one render.
   */
  async dashboard(input: { userId: string; businessId: string | null }) {
    const { userId, businessId } = input;
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setHours(23, 59, 59, 999);
    // Monday-anchored ISO week start.
    const weekStart = new Date(now);
    const day = (weekStart.getDay() + 6) % 7; // 0=Mon
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - day);
    const weekStartPlus7 = new Date(weekStart);
    weekStartPlus7.setDate(weekStartPlus7.getDate() + 7);

    const [nextAssignment, pending, unread, weekShifts, openBroadcasts] =
      await Promise.all([
        this.db.shiftAssignment.findFirst({
          where: {
            userId,
            shift: { endsAt: { gt: now }, status: { not: "CANCELLED" } },
          },
          orderBy: { shift: { startsAt: "asc" } },
          include: {
            shift: {
              select: {
                id: true,
                startsAt: true,
                endsAt: true,
                roleLabel: true,
                notes: true,
                location: { select: { name: true } },
              },
            },
          },
        }),
        this.db.shiftSubscription.count({
          where: { userId, status: "PENDING" },
        }),
        this.db.notification.count({
          where: { userId, readAt: null },
        }),
        this.db.shiftAssignment.findMany({
          where: {
            userId,
            shift: {
              startsAt: { gte: weekStart, lt: weekStartPlus7 },
              status: { not: "CANCELLED" },
            },
          },
          include: {
            shift: { select: { startsAt: true, endsAt: true } },
          },
        }),
        businessId
          ? this.db.notification.findMany({
              where: { userId, type: "SHIFT_BROADCAST", readAt: null },
              orderBy: { createdAt: "desc" },
              take: 25,
            })
          : Promise.resolve([] as { payload: unknown }[]),
      ]);

    const broadcastShiftIds = (openBroadcasts as { payload: unknown }[])
      .map((n) => (n.payload as { shiftId?: string } | null)?.shiftId)
      .filter((id): id is string => Boolean(id));
    const broadcasts =
      broadcastShiftIds.length === 0 || !businessId
        ? []
        : (
            await this.db.shift.findMany({
              where: {
                id: { in: broadcastShiftIds },
                businessId,
                endsAt: { gt: now },
                status: { not: "CANCELLED" },
              },
              include: { assignments: { select: { userId: true } } },
            })
          )
            .filter(
              (s) =>
                s.assignments.length < s.requiredSpots &&
                !s.assignments.some((a) => a.userId === userId),
            )
            .map((s) => ({
              id: s.id,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              roleLabel: s.roleLabel,
            }));

    const scheduledHoursThisWeek = weekShifts.reduce((sum, a) => {
      const h =
        (a.shift.endsAt.getTime() - a.shift.startsAt.getTime()) / 3_600_000;
      return sum + h;
    }, 0);

    return {
      nextShift: nextAssignment
        ? {
            assignmentId: nextAssignment.id,
            shiftId: nextAssignment.shift.id,
            startsAt: nextAssignment.shift.startsAt,
            endsAt: nextAssignment.shift.endsAt,
            roleLabel: nextAssignment.shift.roleLabel,
            notes: nextAssignment.shift.notes,
            locationName: nextAssignment.shift.location?.name ?? null,
          }
        : null,
      pendingApplications: pending,
      unreadNotifications: unread,
      scheduledHoursThisWeek,
      broadcasts,
    };
  }

  /**
   * Returns the personal ICS calendar URL workers can subscribe to from
   * Apple/Google Calendar etc. The URL is signed with NEXTAUTH_SECRET and a
   * per-user rotation counter, so calling `rotateCalendarToken` instantly
   * invalidates the previously-shared link.
   */
  async calendarUrl(userId: string): Promise<{ url: string | null }> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, icsRotation: true },
    });
    const secret = process.env.NEXTAUTH_SECRET;
    const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";
    if (!user || !secret) return { url: null };
    const token = signCalendarToken(user.id, secret, user.icsRotation);
    const path = `/api/calendar.ics?userId=${encodeURIComponent(
      user.id,
    )}&token=${token}`;
    return { url: base ? `${base}${path}` : path };
  }

  async rotateCalendarToken(userId: string): Promise<{ url: string | null }> {
    const user = await this.db.user.update({
      where: { id: userId },
      data: { icsRotation: { increment: 1 } },
      select: { id: true, icsRotation: true },
    });
    const secret = process.env.NEXTAUTH_SECRET;
    const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";
    if (!secret) return { url: null };
    const token = signCalendarToken(user.id, secret, user.icsRotation);
    const path = `/api/calendar.ics?userId=${encodeURIComponent(
      user.id,
    )}&token=${token}`;
    return { url: base ? `${base}${path}` : path };
  }

  async profile(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatarUrl: true,
        locale: true,
        notificationPrefs: true,
        role: true,
        status: true,
        contractType: true,
      },
    });
  }

  async updateProfile(userId: string, input: MeUpdateProfileInput) {
    return this.db.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        phone: input.phone,
        locale: input.locale,
        avatarUrl: input.avatarUrl,
        notificationPrefs: input.notificationPrefs as never,
      },
    });
  }

  async changePassword(input: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ success: true }> {
    const user = await this.db.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    const valid = await compare(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Current password is incorrect",
      });
    }
    await this.db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(input.newPassword, 12) },
    });
    return { success: true };
  }
}
