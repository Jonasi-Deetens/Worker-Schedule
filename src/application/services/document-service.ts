import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";
import { presignS3Put } from "@/infrastructure/storage/s3-presign";

/**
 * Documents track per-worker files (ID card, work contract, food safety
 * certificate, etc.). When S3-compatible storage is configured, the client
 * uploads via a presigned PUT URL directly to the bucket; we only store the
 * resulting object key + metadata in the database.
 */
export type DocumentKind =
  | "ID_CARD"
  | "WORK_CONTRACT"
  | "RESIDENCE_PERMIT"
  | "FOOD_SAFETY"
  | "OTHER";

/** Cap uploads at 10 MiB. Documents we accept are scans / PDFs / small images. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Allow-list of content types we accept directly from the browser. */
export const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

export function isStorageConfigured(): boolean {
  return Boolean(
    env.STORAGE_ENDPOINT &&
      env.STORAGE_REGION &&
      env.STORAGE_BUCKET &&
      env.STORAGE_ACCESS_KEY &&
      env.STORAGE_SECRET_KEY,
  );
}

export class DocumentService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Issues a presigned PUT URL for the browser. The object key embeds the
   * owning user id so cross-tenant uploads can't collide, and a random uuid
   * so callers can race retries safely.
   *
   * Throws if storage is not configured — callers must check
   * {@link isStorageConfigured} first and hide the UI accordingly.
   */
  presignUpload(input: {
    userId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }) {
    if (!isStorageConfigured()) {
      throw new Error("Object storage is not configured");
    }
    if (input.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new Error("File is larger than 10 MiB");
    }
    if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
      throw new Error("Content type not allowed");
    }
    const safeName = input.fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
    const key = `documents/${input.userId}/${randomUUID()}-${safeName}`;
    const presigned = presignS3Put({
      endpoint: env.STORAGE_ENDPOINT!,
      region: env.STORAGE_REGION!,
      bucket: env.STORAGE_BUCKET!,
      accessKeyId: env.STORAGE_ACCESS_KEY!,
      secretAccessKey: env.STORAGE_SECRET_KEY!,
      key,
      contentType: input.contentType,
      expiresInSeconds: 600,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === true,
    });
    return { ...presigned, key };
  }

  listForUser(userId: string) {
    return this.db.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async listForBusiness(businessId: string, opts?: { expiringWithinDays?: number }) {
    const now = new Date();
    const horizon = opts?.expiringWithinDays
      ? new Date(now.getTime() + opts.expiringWithinDays * 86_400_000)
      : null;
    return this.db.document.findMany({
      where: {
        user: { businessId },
        ...(horizon
          ? { expiresOn: { not: null, lte: horizon, gte: now } }
          : {}),
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { expiresOn: "asc" },
    });
  }

  create(input: {
    userId: string;
    kind: DocumentKind;
    url: string;
    fileName: string;
    contentType?: string;
    sizeBytes?: number;
    expiresOn?: Date | null;
  }) {
    return this.db.document.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        url: input.url,
        fileName: input.fileName,
        contentType: input.contentType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        expiresOn: input.expiresOn ?? null,
      },
    });
  }

  async delete(input: { id: string; userId: string; isOwnerOrManager: boolean }) {
    const doc = await this.db.document.findUnique({ where: { id: input.id } });
    if (!doc) throw new Error("Document not found");
    if (doc.userId !== input.userId && !input.isOwnerOrManager) {
      throw new Error("Cannot delete another user's document");
    }
    return this.db.document.delete({ where: { id: input.id } });
  }
}
