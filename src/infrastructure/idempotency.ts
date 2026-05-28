/**
 * Tiny in-process idempotency cache for public POST endpoints.
 *
 * The cache stores a serialised response keyed by `{ apiKeyId, idempotencyKey }`
 * so that retries from a flaky integrator return the original response instead
 * of double-creating resources. Each entry expires after `ttlMs` (default 24h).
 *
 * Single-process only; swap the `store` for Redis when running behind multiple
 * Next.js instances. The cache also fingerprints the request body so a key
 * collision against a different payload surfaces as a 409 instead of silently
 * returning the wrong response.
 */
import { createHash } from "crypto";

interface CachedResponse {
  status: number;
  body: string;
  bodyFingerprint: string;
  expiresAt: number;
}

const STORE = new Map<string, CachedResponse>();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_LEN = 1024 * 1024; // 1 MiB cap

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function gc(store: Map<string, CachedResponse>, now: number): void {
  // Probabilistic sweep: 1% chance per put to avoid an unbounded loop.
  if (Math.random() > 0.01) return;
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
}

export interface IdempotencyOptions {
  apiKeyId: string;
  idempotencyKey: string;
  /** Raw request body for fingerprinting. */
  body: string;
  /** Optional store override for tests. */
  store?: Map<string, CachedResponse>;
  ttlMs?: number;
  now?: () => number;
}

export interface IdempotencyHit {
  kind: "hit";
  status: number;
  body: string;
}
export interface IdempotencyConflict {
  kind: "conflict";
}
export interface IdempotencyMiss {
  kind: "miss";
  /** Call after the upstream returns to memoise the response. */
  remember(status: number, body: string): void;
}

export type IdempotencyResult =
  | IdempotencyHit
  | IdempotencyConflict
  | IdempotencyMiss;

/**
 * Returns one of:
 * - `hit`: a previously-cached response — replay it untouched.
 * - `conflict`: the key is re-used with a different body — the caller should
 *   return 409 Conflict.
 * - `miss`: no entry; the caller proceeds and must call `remember(...)` once
 *   the upstream response is ready so subsequent retries become hits.
 */
export function checkIdempotency(opts: IdempotencyOptions): IdempotencyResult {
  const store = opts.store ?? STORE;
  const now = opts.now ? opts.now() : Date.now();
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const key = `${opts.apiKeyId}:${opts.idempotencyKey}`;
  const fingerprint = sha256(opts.body.slice(0, MAX_BODY_LEN));

  const existing = store.get(key);
  if (existing && existing.expiresAt > now) {
    if (existing.bodyFingerprint !== fingerprint) {
      return { kind: "conflict" };
    }
    return { kind: "hit", status: existing.status, body: existing.body };
  }
  if (existing) store.delete(key);

  return {
    kind: "miss",
    remember(status, body) {
      store.set(key, {
        status,
        body,
        bodyFingerprint: fingerprint,
        expiresAt: now + ttl,
      });
      gc(store, now);
    },
  };
}
