import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/**
 * Stable scopes for the public REST surface. Adding a new scope is a
 * deliberate decision; existing keys keep working but never gain it.
 */
export const API_SCOPES = [
  "shifts:read",
  "shifts:write",
  "assignments:read",
  "assignments:write",
  "workers:read",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function generateRawKey(): { raw: string; prefix: string; hashed: string } {
  const random = randomBytes(24).toString("base64url");
  const raw = `tg_${random}`;
  return { raw, prefix: raw.slice(0, 8), hashed: sha256(raw) };
}

export class ApiKeyService {
  constructor(private readonly db: PrismaClient) {}

  /** Returns redacted rows; the raw key is only available at creation time. */
  list(businessId: string) {
    return this.db.apiKey.findMany({
      where: { businessId, revokedAt: null },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Creates a key and returns the raw value once. Caller must show it then forget it. */
  async create(input: {
    businessId: string;
    name: string;
    scopes: ApiScope[];
    expiresAt?: Date | null;
  }) {
    const invalid = input.scopes.filter((s) => !API_SCOPES.includes(s));
    if (invalid.length) throw new Error(`Unknown scope: ${invalid.join(", ")}`);
    const { raw, prefix, hashed } = generateRawKey();
    const row = await this.db.apiKey.create({
      data: {
        businessId: input.businessId,
        name: input.name,
        hashedKey: hashed,
        prefix,
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
      },
    });
    return { id: row.id, prefix: row.prefix, raw };
  }

  async revoke(input: { id: string; businessId: string }) {
    const existing = await this.db.apiKey.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!existing) throw new Error("API key not found");
    return this.db.apiKey.update({
      where: { id: input.id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Looks up a key by its raw value. Returns null when the key is unknown,
   * revoked or expired. Updates `lastUsedAt` as a side-effect on hit.
   */
  async authenticate(raw: string) {
    if (!raw.startsWith("tg_")) return null;
    const hashed = sha256(raw);
    const key = await this.db.apiKey.findUnique({
      where: { hashedKey: hashed },
    });
    if (!key) return null;
    if (key.revokedAt) return null;
    if (key.expiresAt && key.expiresAt < new Date()) return null;
    await this.db.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return {
      id: key.id,
      businessId: key.businessId,
      scopes: key.scopes as ApiScope[],
    };
  }
}
