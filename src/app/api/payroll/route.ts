import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { prisma } from "@/infrastructure/db/prisma";
import { decryptPiiNullable } from "@/infrastructure/crypto/pii";
import { HolidayService } from "@/application/services/holiday-service";
import {
  buildAbsenceRows,
  buildPayrollRows,
  payrollContentType,
  payrollFilename,
  PROVIDERS,
  renderPayrollCsvWithVariance,
  resolveFormat,
  summarizeStuVariance,
} from "@/infrastructure/payroll/providers";

/**
 * Owner/manager-only payroll export. Combines approved `TimeEntry` rows (split
 * into per-wage-code rows: regular/overtime/night/weekend/holiday) with absence
 * rows from approved time-off and a STU planned-vs-actual variance section.
 *
 * The `?provider=` query selects the column layout (`sdworx`, `securex`,
 * `partena`, `liantis`, or `generic`) and `?format=` selects CSV (default) or
 * Excel (`xlsx`). JOBSTUDENT rows are flagged for the solidarity regime. The
 * `employee_id` column uses the worker's decrypted NISS, never the internal
 * database id, and dates are formatted in the business timezone.
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
  const format = resolveFormat(url.searchParams.get("format"));

  const now = new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = toParam ? new Date(toParam) : now;
  const periodEnd = new Date(to.getTime() + 86_400_000);

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { timezone: true },
  });
  const timeZone = business?.timezone ?? "Europe/Brussels";

  // Effective public-holiday calendar (statutory Belgian holidays + custom
  // business closure days) for the export window, so worked minutes on a
  // holiday land in the HOLIDAY wage bucket.
  const holidays = await new HolidayService(prisma).effectiveHolidaySet({
    businessId: session.user.businessId,
    from,
    to: periodEnd,
  });

  const entries = await prisma.timeEntry.findMany({
    where: {
      status: "APPROVED",
      approvedAt: { not: null },
      clockOutAt: { not: null },
      user: { businessId: session.user.businessId },
      clockInAt: { gte: from, lte: periodEnd },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          hourlyRate: true,
          nationalNumber: true,
          contractType: true,
        },
      },
    },
    orderBy: { clockInAt: "asc" },
  });

  // NISS is stored encrypted at rest; decrypt it for the payroll `employee_id`
  // column. Legacy plaintext rows pass through unchanged.
  const decryptedEntries = entries.map((entry) => ({
    ...entry,
    user: {
      ...entry.user,
      nationalNumber: decryptPiiNullable(entry.user.nationalNumber),
    },
  }));

  const rows = buildPayrollRows(decryptedEntries, { timeZone, holidays });

  // Approved time-off overlapping the window becomes one ABSENCE row per day.
  const timeOff = await prisma.timeOffRequest.findMany({
    where: {
      status: "APPROVED",
      user: { businessId: session.user.businessId },
      startsAt: { lte: periodEnd },
      endsAt: { gte: from },
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          hourlyRate: true,
          nationalNumber: true,
          contractType: true,
        },
      },
    },
  });
  const absenceRows = buildAbsenceRows(
    timeOff.map((request) => ({
      startsAt: request.startsAt,
      endsAt: request.endsAt,
      user: {
        ...request.user,
        nationalNumber: decryptPiiNullable(request.user.nationalNumber),
      },
    })),
    { from, to: periodEnd },
    timeZone,
  );

  // STU planned (Dimona) vs actual approved hours for the period's quarter.
  const year = from.getFullYear();
  const quarter = Math.floor(from.getMonth() / 3) + 1;
  const stuDeclarations = await prisma.dimonaStuDeclaration.findMany({
    where: { businessId: session.user.businessId, year, quarter },
    include: {
      user: { select: { name: true, email: true, nationalNumber: true } },
    },
  });
  const variance = summarizeStuVariance(
    stuDeclarations.map((declaration) => ({
      userId: declaration.userId,
      plannedHours: declaration.plannedHours,
      user: {
        ...declaration.user,
        nationalNumber: decryptPiiNullable(declaration.user.nationalNumber),
      },
    })),
    decryptedEntries.map((entry) => ({
      userId: entry.userId,
      clockInAt: entry.clockInAt,
      clockOutAt: entry.clockOutAt,
      breakMinutes: entry.breakMinutes,
    })),
  );

  const allRows = [...rows, ...absenceRows];
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);
  const filename = payrollFilename(provider, format, fromIso, toIso);

  let body: string | Buffer;
  if (format === "xlsx") {
    const { renderPayrollXlsx } = await import("@/infrastructure/payroll/xlsx");
    body = await renderPayrollXlsx(provider, allRows, variance);
  } else {
    body = renderPayrollCsvWithVariance(provider, allRows, variance);
  }

  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": payrollContentType(format),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
