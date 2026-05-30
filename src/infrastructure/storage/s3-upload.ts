import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { isStorageConfigured } from "@/application/services/document-service";
import { presignS3Put } from "./s3-presign";

/**
 * Server-side object upload for bytes we generate ourselves (e.g. contract
 * PDFs). Reuses the same presigned-PUT path the browser uses for documents, so
 * there's a single storage configuration and signing implementation.
 *
 * Returns the stable object URL (signing query stripped) on success. Callers
 * MUST check {@link isStorageConfigured} first — this throws otherwise.
 */
export async function uploadBytes(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<string> {
  if (!isStorageConfigured()) {
    throw new Error("Object storage is not configured");
  }
  const presigned = presignS3Put({
    endpoint: env.STORAGE_ENDPOINT!,
    region: env.STORAGE_REGION!,
    bucket: env.STORAGE_BUCKET!,
    accessKeyId: env.STORAGE_ACCESS_KEY!,
    secretAccessKey: env.STORAGE_SECRET_KEY!,
    key: input.key,
    contentType: input.contentType,
    expiresInSeconds: 600,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === true,
  });

  const res = await fetch(presigned.url, {
    method: "PUT",
    // Buffer/Uint8Array is an acceptable BodyInit in the Node fetch runtime.
    body: input.body as unknown as BodyInit,
    headers: presigned.headers,
  });
  if (!res.ok) {
    throw new Error(`Object upload failed (${res.status})`);
  }
  return presigned.url.split("?")[0]!;
}

/** Builds a collision-resistant object key for a generated contract PDF. */
export function contractPdfKey(userId: string): string {
  return `contracts/${userId}/${randomUUID()}.pdf`;
}

export function contractStudentSignatureKey(contractId: string): string {
  return `contracts/${contractId}/signature-student.png`;
}

export function contractEmployerSignatureKey(contractId: string): string {
  return `contracts/${contractId}/signature-employer.png`;
}
