import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/prisma";
import { env } from "@/lib/env";

/**
 * Liveness + readiness endpoint. Verifies:
 * - the process can talk to Postgres (1 ms query)
 * - the configured Dimona environment is sane
 *
 * Returns `200` when everything healthy, `503` otherwise so load balancers
 * can detect a failure quickly. Response body is intentionally small so this
 * is cheap to hit on a tight interval.
 */
export async function GET() {
  const checks: Record<string, "ok" | "fail" | "skipped"> = {};
  const details: Record<string, string> = {};
  let ok = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    ok = false;
    checks.database = "fail";
    details.database = err instanceof Error ? err.message : String(err);
  }

  if (env.DIMONA_ENV === "mock") {
    checks.dimona = "skipped";
  } else if (env.DIMONA_TOKEN) {
    checks.dimona = "ok";
  } else {
    ok = false;
    checks.dimona = "fail";
    details.dimona = `DIMONA_ENV=${env.DIMONA_ENV} but DIMONA_TOKEN missing`;
  }

  checks.push = env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? "ok" : "skipped";

  const body = {
    ok,
    timestamp: new Date().toISOString(),
    checks,
    ...(Object.keys(details).length ? { details } : {}),
  };
  return NextResponse.json(body, { status: ok ? 200 : 503 });
}
