/**
 * Baseline HTTP security headers applied to every route via `next.config.ts`.
 *
 * Kept in a standalone, dependency-free module so it can be unit-tested without
 * loading the Next.js config (which pulls in the bundler) and reused by both the
 * config and any future edge middleware.
 *
 * CSP notes — this app is a Next.js App Router SPA and we deliberately do NOT
 * run a nonce/hash pipeline yet, so the policy allows:
 *   - `'unsafe-inline'` for `style-src`: Tailwind plus inline `style={{…}}`
 *     props and FullCalendar's injected styles rely on inline styles. This is
 *     the standard, low-risk compromise (style injection is not script exec).
 *   - `'unsafe-inline'` for `script-src`: Next.js injects inline bootstrap /
 *     hydration scripts without a nonce in this setup. Documented as a known
 *     relaxation; tighten with a nonce middleware when we add one.
 *   - `'unsafe-eval'` only in development: the Next dev server / React Refresh
 *     use eval for HMR. Production omits it.
 * Everything else defaults to `'self'`; framing is denied and object/base are
 * locked down.
 */
export interface SecurityHeader {
  key: string;
  value: string;
}

export function buildContentSecurityPolicy(isProd: boolean): string {
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  const connectSrc = ["'self'", "https:"];
  if (!isProd) {
    // Dev-only relaxations for HMR / React Refresh.
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push("ws:", "wss:");
  }

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["form-action", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connectSrc],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
  ];

  return directives
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/**
 * Returns the full set of security headers. `isProd` gates HSTS (only meaningful
 * over HTTPS) and the CSP dev relaxations so local http development is not
 * broken.
 */
export function buildSecurityHeaders(isProd: boolean): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(isProd),
    },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "geolocation=(), camera=(), microphone=(), payment=()",
    },
  ];

  if (isProd) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}
