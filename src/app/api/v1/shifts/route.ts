import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/prisma";
import { ShiftService } from "@/application/services/shift-service";
import { ShiftReadModel } from "@/application/services/shift-read-model";
import { checkIdempotency } from "@/infrastructure/idempotency";
import { authenticateApiKey } from "../_auth";

const listQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

const createBody = z.object({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  roleLabel: z.string().min(1),
  requiredSpots: z.number().int().positive(),
  notes: z.string().optional(),
  requiredSkillId: z.string().optional(),
  publish: z.boolean().optional(),
});

const shiftService = new ShiftService(prisma);
const shiftReadModel = new ShiftReadModel(prisma);

function withRlHeaders(
  res: NextResponse,
  headers: Record<string, string> | undefined,
): NextResponse {
  if (headers) {
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  }
  return res;
}

/**
 * GET /api/v1/shifts?from=ISO&to=ISO
 * Requires `shifts:read` scope. Returns published shifts for the business.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, "shifts:read");
  if (!auth.ok) return auth.response;
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listQuery.safeParse(params);
  if (!parsed.success) {
    return withRlHeaders(
      NextResponse.json(
        { error: "Invalid query", details: parsed.error.format() },
        { status: 400 },
      ),
      auth.rateLimitHeaders,
    );
  }
  const shifts = await shiftReadModel.listForCalendar({
    businessId: auth.businessId,
    from: parsed.data.from,
    to: parsed.data.to,
    includeDrafts: false,
  });
  return withRlHeaders(
    NextResponse.json({ data: shifts }),
    auth.rateLimitHeaders,
  );
}

/**
 * POST /api/v1/shifts
 * Requires `shifts:write` scope. Creates a shift; honour `publish: true` to
 * make it immediately visible to workers.
 *
 * If the caller sends an `Idempotency-Key` header, the response is cached for
 * 24h keyed on `{ apiKeyId, key }`. Re-sending the same key with the same
 * body replays the original response; with a different body returns 409.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, "shifts:write");
  if (!auth.ok) return auth.response;

  const rawBody = await req.text();
  const idempotencyKey = req.headers.get("idempotency-key")?.trim();
  let cacheCommit: ((status: number, body: string) => void) | null = null;

  if (idempotencyKey) {
    const result = checkIdempotency({
      apiKeyId: auth.keyId,
      idempotencyKey,
      body: rawBody,
    });
    if (result.kind === "hit") {
      return withRlHeaders(
        new NextResponse(result.body, {
          status: result.status,
          headers: {
            "Content-Type": "application/json",
            "Idempotent-Replayed": "true",
          },
        }),
        auth.rateLimitHeaders,
      );
    }
    if (result.kind === "conflict") {
      return withRlHeaders(
        NextResponse.json(
          {
            error:
              "Idempotency-Key already used with a different request body",
          },
          { status: 409 },
        ),
        auth.rateLimitHeaders,
      );
    }
    cacheCommit = result.remember;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return withRlHeaders(
      NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
      auth.rateLimitHeaders,
    );
  }
  const parsed = createBody.safeParse(body);
  if (!parsed.success) {
    return withRlHeaders(
      NextResponse.json(
        { error: "Invalid body", details: parsed.error.format() },
        { status: 400 },
      ),
      auth.rateLimitHeaders,
    );
  }
  try {
    const shift = await shiftService.create({
      ...parsed.data,
      businessId: auth.businessId,
      ownerId: auth.businessId,
    });
    const respBody = JSON.stringify({ data: shift });
    cacheCommit?.(201, respBody);
    return withRlHeaders(
      new NextResponse(respBody, {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
      auth.rateLimitHeaders,
    );
  } catch (err) {
    return withRlHeaders(
      NextResponse.json(
        { error: err instanceof Error ? err.message : "Server error" },
        { status: 400 },
      ),
      auth.rateLimitHeaders,
    );
  }
}
