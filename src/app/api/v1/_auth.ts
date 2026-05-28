import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/infrastructure/db/prisma";
import { ApiKeyService, type ApiScope } from "@/application/services/api-key-service";
import { rateLimit } from "@/infrastructure/rate-limit";

const service = new ApiKeyService(prisma);

/** Per-API-key request budgets. Tunable via env in the future. */
const API_RATE_LIMITS = {
  read: { limit: 600, windowMs: 60_000 }, // 10 req/s sustained
  write: { limit: 120, windowMs: 60_000 }, // 2 req/s sustained
} as const;

export async function authenticateApiKey(req: NextRequest, required: ApiScope) {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 },
      ),
    };
  }
  const key = await service.authenticate(match[1]);
  if (!key) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Invalid API key" }, { status: 401 }),
    };
  }
  if (!key.scopes.includes(required)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: `Missing scope: ${required}` },
        { status: 403 },
      ),
    };
  }
  // Read vs write scopes get separate budgets so a noisy `GET` doesn't
  // starve a critical `POST` from the same key.
  const isWrite = required.endsWith(":write");
  const budget = isWrite ? API_RATE_LIMITS.write : API_RATE_LIMITS.read;
  const rl = rateLimit({
    key: `api:${key.id}:${isWrite ? "w" : "r"}`,
    limit: budget.limit,
    windowMs: budget.windowMs,
  });
  if (!rl.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rl.resetAt - Date.now()) / 1000),
    );
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(budget.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          },
        },
      ),
    };
  }
  return {
    ok: true as const,
    businessId: key.businessId,
    keyId: key.id,
    rateLimitHeaders: {
      "X-RateLimit-Limit": String(budget.limit),
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
    },
  };
}
