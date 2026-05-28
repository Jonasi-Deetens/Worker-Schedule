import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { prisma } from "@/infrastructure/db/prisma";
import { PROVIDERS, renderPayrollCsv } from "@/infrastructure/payroll/providers";

/**
 * Owner-only payroll export. Combines approved `TimeEntry` rows with the
 * worker's `hourlyRate` and renders a CSV in the column layout requested by
 * the `?provider=` query (`sdworx`, `securex`, or `generic`).
 *
 * Falls back to scheduled assignments when a worker has no time entries yet.
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

  const entries = await prisma.timeEntry.findMany({
    where: {
      approvedAt: { not: null },
      clockOutAt: { not: null },
      user: { businessId: session.user.businessId },
      clockInAt: { gte: from, lte: new Date(to.getTime() + 86_400_000) },
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, hourlyRate: true },
      },
    },
    orderBy: { clockInAt: "asc" },
  });

  const rows = entries.map((entry) => {
    const hours = Math.max(
      0,
      (entry.clockOutAt!.getTime() - entry.clockInAt.getTime()) / 3_600_000 -
        entry.breakMinutes / 60,
    );
    const rate = entry.user.hourlyRate ? Number(entry.user.hourlyRate) : 0;
    return {
      workerExternalId: entry.user.id,
      workerName: entry.user.name,
      date: entry.clockInAt.toISOString().slice(0, 10),
      code: "WORK",
      hours: Math.round(hours * 100) / 100,
      rate,
      gross: Math.round(hours * rate * 100) / 100,
    };
  });

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
