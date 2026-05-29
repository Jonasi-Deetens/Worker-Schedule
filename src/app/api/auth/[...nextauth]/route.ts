import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { AUTH_RATE_LIMIT, rateLimit } from "@/infrastructure/rate-limit";

type RouteContext = { params: Promise<{ nextauth: string[] }> };

const handler = NextAuth(authOptions) as unknown as (
  req: NextRequest,
  context: RouteContext,
) => Promise<Response>;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return handler(req, context);
}

export function POST(
  req: NextRequest,
  context: RouteContext,
): Promise<Response> {
  // Throttle credential sign-in attempts by IP. We only gate the credentials
  // callback so OAuth and session endpoints stay untouched (won't break
  // Auth.js's own flows).
  if (req.nextUrl.pathname.endsWith("/callback/credentials")) {
    const limit = rateLimit({
      key: `login:${clientIp(req)}`,
      limit: AUTH_RATE_LIMIT.limit,
      windowMs: AUTH_RATE_LIMIT.windowMs,
    });
    if (!limit.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((limit.resetAt - Date.now()) / 1000),
      );
      return Promise.resolve(
        NextResponse.json(
          { error: "Too many login attempts. Please try again later." },
          { status: 429, headers: { "Retry-After": String(retryAfter) } },
        ),
      );
    }
  }
  return handler(req, context);
}
