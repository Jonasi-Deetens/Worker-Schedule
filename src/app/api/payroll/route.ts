import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { prisma } from "@/infrastructure/db/prisma";
import {
  buildPayrollRows,
  PROVIDERS,
  renderPayrollCsv,
} from "@/infrastructure/payroll/providers";

/**
 * Owner/manager-only payroll export. Combines approved `TimeEntry` rows with
 * the worker's `hourlyRate` and renders a CSV in the column layout requested
 * by the `?provider=` query (`sdworx`, `securex`, or `generic`).
 *
 * Only approved, closed time entries are exported — there is no fallback to
 * scheduled assignments. The `employee_id` column uses the worker's payroll
 * identifier (`nationalNumber`/NISS), never the internal database id, and the
 * date is formatted in the business timezone so a late-evening shift is not
 * pushed onto the next calendar day by UTC.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.businessId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (session.user.role !== "OWNER" && session.user.role !== "MANAGER") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const providerKey = (url.searchParams.get("provider") ?? "generic").toLowerCase();
  const provider = PROVIDERS[providerKey] ?? PROVIDERS.generic!;

  const now = new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = toParam ? new Date(toParam) : now;

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { timezone: true },
  });
  const timeZone = business?.timezone ?? "Europe/Brussels";

  const entries = await prisma.timeEntry.findMany({
    where: {
      status: "APPROVED",
      approvedAt: { not: null },
      clockOutAt: { not: null },
      user: { businessId: session.user.businessId },
      clockInAt: { gte: from, lte: new Date(to.getTime() + 86_400_000) },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          hourlyRate: true,
          nationalNumber: true,
        },
      },
    },
    orderBy: { clockInAt: "asc" },
  });

  const rows = buildPayrollRows(entries, timeZone);

  const body = renderPayrollCsv(provider, rows);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${from
        .toISOString()
        .slice(0, 10)}-to-${to.toISOString().slice(0, 10)}${provider.fileSuffix}"`,
      "Cache-Control": "no-store",
    },
  });
}
