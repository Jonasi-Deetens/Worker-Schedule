import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from "@/lib/security-headers";

describe("buildSecurityHeaders", () => {
  it("returns the baseline header set in development (no HSTS)", () => {
    const headers = buildSecurityHeaders(false);
    const keys = headers.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Content-Security-Policy",
        "X-Frame-Options",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ]),
    );
    expect(keys).not.toContain("Strict-Transport-Security");
  });

  it("adds HSTS in production", () => {
    const headers = buildSecurityHeaders(true);
    const hsts = headers.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts?.value).toMatch(/max-age=\d+/);
    expect(hsts?.value).toContain("includeSubDomains");
  });

  it("locks down framing and sniffing", () => {
    const headers = buildSecurityHeaders(true);
    const map = Object.fromEntries(headers.map((h) => [h.key, h.value]));
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(map["Permissions-Policy"]).toContain("geolocation=()");
    expect(map["Permissions-Policy"]).toContain("camera=()");
    expect(map["Permissions-Policy"]).toContain("microphone=()");
  });
});

describe("buildContentSecurityPolicy", () => {
  it("defaults to self and denies framing", () => {
    const csp = buildContentSecurityPolicy(true);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("permits unsafe-eval only in development", () => {
    expect(buildContentSecurityPolicy(false)).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy(true)).not.toContain("'unsafe-eval'");
  });

  it("allows https images and connections for avatars and Sentry", () => {
    const csp = buildContentSecurityPolicy(true);
    expect(csp).toMatch(/img-src[^;]*https:/);
    expect(csp).toMatch(/connect-src[^;]*https:/);
  });
});
