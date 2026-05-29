import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, per-location QR clock-in tokens. A token embeds the location id and
 * an HMAC of that id keyed by the location's `qrSecret`, so a worker scanning a
 * venue's printed QR proves which location they are at without any extra
 * lookup table. Tokens are deterministic (no expiry) — rotating `qrSecret`
 * invalidates every previously printed code at once.
 *
 * Format: `<locationId>.<base64url(hmacSha256(locationId, secret))>`
 */

function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(locationId: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(locationId).digest());
}

/** Builds the signed token a location's QR code should encode. */
export function signLocationToken(locationId: string, secret: string): string {
  return `${locationId}.${sign(locationId, secret)}`;
}

/**
 * Extracts the location id portion of a token WITHOUT verifying it. Used to
 * look up the location (and its secret) before verification. Returns null when
 * the token is malformed.
 */
export function parseLocationTokenId(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  return token.slice(0, dot);
}

/**
 * Constant-time verification of a token against a location's secret. Returns
 * false for any malformed token, secret mismatch, or tampered signature.
 */
export function verifyLocationToken(token: string, secret: string): boolean {
  const locationId = parseLocationTokenId(token);
  if (!locationId || !secret) return false;

  const provided = token.slice(locationId.length + 1);
  const expected = sign(locationId, secret);
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
