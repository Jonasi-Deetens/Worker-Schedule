import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM helper for sensitive personal data (PII) such as the Belgian
 * national register number (NISS). It reuses the same wire format and primitive
 * as {@link src/infrastructure/dimona/crypto.ts} but is keyed by a dedicated
 * `PII_ENCRYPTION_KEY`, falling back to `DIMONA_ENCRYPTION_KEY` when unset so a
 * single-secret deployment still works.
 *
 * Wire format: `<iv-base64>.<authTag-base64>.<ciphertext-base64>`.
 *
 * Decryption is intentionally *tolerant*: values that are not in the encrypted
 * wire format (e.g. legacy plaintext rows or seed data) are returned unchanged
 * so existing data keeps working without a backfill.
 */
const ALGO = "aes-256-gcm";

function key(): Buffer {
  const secret =
    process.env.PII_ENCRYPTION_KEY ??
    process.env.DIMONA_ENCRYPTION_KEY ??
    "dev-key-do-not-use-in-production";
  return createHash("sha256").update(secret).digest();
}

/** Returns true when the value already looks like our AES-GCM wire format. */
function looksEncrypted(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const base64 = /^[A-Za-z0-9+/]+={0,2}$/;
  return parts.every((p) => p.length > 0 && base64.test(p));
}

export function encryptPii(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

/**
 * Decrypts a PII value. If the input is not in the encrypted wire format, or
 * decryption fails (e.g. a value containing dots that isn't ours), the original
 * value is returned as-is so legacy plaintext keeps working.
 */
export function decryptPii(payload: string): string {
  if (!looksEncrypted(payload)) return payload;
  try {
    const [ivB, tagB, encB] = payload.split(".");
    const iv = Buffer.from(ivB!, "base64");
    const tag = Buffer.from(tagB!, "base64");
    const enc = Buffer.from(encB!, "base64");
    const decipher = createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return payload;
  }
}

/** Convenience wrappers tolerant of null/undefined for optional DB columns. */
export function encryptPiiNullable(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return encryptPii(value);
}

export function decryptPiiNullable(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  return decryptPii(value);
}
