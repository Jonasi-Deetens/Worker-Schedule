import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM helper used to encrypt `Business.dimonaCredentials` at rest.
 * Key is derived from `DIMONA_ENCRYPTION_KEY` env var by SHA-256. In production
 * use a 32-byte secret managed via your secrets store.
 */
const ALGO = "aes-256-gcm";

function key(): Buffer {
  const secret = process.env.DIMONA_ENCRYPTION_KEY ?? "dev-key-do-not-use-in-production";
  return createHash("sha256").update(secret).digest();
}

export function encryptString(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptString(payload: string): string {
  const [ivB, tagB, encB] = payload.split(".");
  if (!ivB || !tagB || !encB) throw new Error("Malformed Dimona credentials");
  const iv = Buffer.from(ivB, "base64");
  const tag = Buffer.from(tagB, "base64");
  const enc = Buffer.from(encB, "base64");
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
