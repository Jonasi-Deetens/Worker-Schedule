import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/prisma";
import {
  buildEventUid,
  buildIcal,
  verifyCalendarToken,
} from "@/lib/ical";

/**
 * Public iCal feed for a single user. Authentication uses a signed share
 * token instead of a session cookie so the URL can be subscribed to from
 * calendar clients that do not carry the user's browser session.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const token = url.searchParams.get("token");
  const secret = process.env.NEXTAUTH_SECRET;

  if (!userId || !token || !secret) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      businessId: true,
      role: true,
      icsRotation: true,
    },
  });
  if (!user) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!verifyCalendarToken(userId, token, secret, user.icsRotation)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const assignments = await prisma.shiftAssignment.findMany({
    where: { userId },
    include: {
      shift: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          roleLabel: true,
          notes: true,
          businessId: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const events = assignments
    .filter((a) => a.shift.status !== "CANCELLED")
    .map((a) => ({
      uid: buildEventUid(a.shift.id, a.shift.businessId),
      summary: a.shift.roleLabel,
      description: a.shift.notes ?? undefined,
      startsAt: a.shift.startsAt,
      endsAt: a.shift.endsAt,
    }));

  const body = buildIcal({
    events,
    calendarName: `Work Calendar — ${user.name}`,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="work-calendar.ics"',
      "Cache-Control": "no-store",
    },
  });
}
