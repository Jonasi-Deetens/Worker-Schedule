import { getServerSession } from "next-auth";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { authOptions } from "@/infrastructure/auth/auth-options";
import type { TRPCContext } from "./init";

/** Extracts a best-effort client IP from the incoming request headers. */
function getClientIp(req?: Request): string | null {
  if (!req) return null;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.headers.get("x-real-ip");
}

export async function createTRPCContext(
  opts?: FetchCreateContextFnOptions,
): Promise<TRPCContext> {
  const session = await getServerSession(authOptions);
  return {
    session: session as TRPCContext["session"],
    ip: getClientIp(opts?.req),
  };
}
