/**
 * Sliding-window rate limiter.
 *
 * ── Scale-out swap point ──────────────────────────────────────────────────
 * The default {@link InMemoryRateLimiter} counts requests per-process, so each
 * instance enforces the limit independently (N instances ≈ N× the limit). For
 * a shared/global limit across instances, implement {@link RateLimiter} over a
 * shared counter (e.g. Redis INCR + EXPIRE) and install it via
 * {@link setRateLimiter}. Call sites use the module-level `rateLimit()` helper,
 * so they don't change. No Redis dependency is added here.
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

export interface RateLimiter {
  check(options: RateLimitOptions): RateLimitResult;
}

export class InMemoryRateLimiter implements RateLimiter {
  constructor(private readonly defaultStore: Map<string, Bucket> = DEFAULT_BUCKETS) {}

  check(options: RateLimitOptions): RateLimitResult {
    const store = options.store ?? this.defaultStore;
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
}

let activeRateLimiter: RateLimiter = new InMemoryRateLimiter();

/** Swap the rate-limiter implementation (e.g. a Redis-backed one) at boot. */
export function setRateLimiter(limiter: RateLimiter): void {
  activeRateLimiter = limiter;
}

export function rateLimit(options: RateLimitOptions): RateLimitResult {
  return activeRateLimiter.check(options);
}

/** Convenience preset for auth endpoints: 10 attempts / minute. */
export const AUTH_RATE_LIMIT = { limit: 10, windowMs: 60_000 };
/** Convenience preset for mutation endpoints: 60 / minute. */
export const MUTATION_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
