/**
 * In-memory sliding-window rate limiter. Suitable for a single-process MVP
 * deployment; swap the backing `store` for Redis (e.g. Upstash) when running
 * behind multiple instances.
 */
interface Bucket {
  windowStart: number;
  count: number;
}

const DEFAULT_BUCKETS = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Identifier (IP, user, etc.) under which to track requests. */
  key: string;
  /** Maximum allowed requests within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Optional override for the backing store - mainly used in tests. */
  store?: Map<string, Bucket>;
  /** Optional clock injection for tests. */
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(options: RateLimitOptions): RateLimitResult {
  const store = options.store ?? DEFAULT_BUCKETS;
  const now = options.now ? options.now() : Date.now();
  const existing = store.get(options.key);

  if (!existing || now - existing.windowStart >= options.windowMs) {
    const bucket: Bucket = { windowStart: now, count: 1 };
    store.set(options.key, bucket);
    return {
      allowed: true,
      remaining: options.limit - 1,
      resetAt: now + options.windowMs,
    };
  }

  if (existing.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.windowStart + options.windowMs,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: options.limit - existing.count,
    resetAt: existing.windowStart + options.windowMs,
  };
}

/** Convenience preset for auth endpoints: 10 attempts / minute. */
export const AUTH_RATE_LIMIT = { limit: 10, windowMs: 60_000 };
/** Convenience preset for mutation endpoints: 60 / minute. */
export const MUTATION_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
