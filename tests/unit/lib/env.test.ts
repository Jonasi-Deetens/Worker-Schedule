import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `src/lib/env.ts` short-circuits validation when `NODE_ENV === "test"` so
 * unit tests don't need to set up the full env. We exercise the validator
 * directly here by forcing `NODE_ENV=development` and stubbing `process.env`.
 */
describe("env validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    for (const key of Object.keys(process.env)) delete process.env[key];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  const setEnv = (overrides: Record<string, string>) => {
    Object.assign(process.env as Record<string, string>, overrides);
  };

  it("rejects a missing DATABASE_URL", async () => {
    setEnv({
      NODE_ENV: "development",
      NEXTAUTH_SECRET: "x".repeat(40),
    });
    await expect(import("@/lib/env")).rejects.toThrow(/Invalid environment/);
  });

  it("rejects a too-short NEXTAUTH_SECRET", async () => {
    setEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://x",
      NEXTAUTH_SECRET: "short",
    });
    await expect(import("@/lib/env")).rejects.toThrow(/Invalid environment/);
  });

  it("accepts a valid configuration and defaults DIMONA_ENV to mock", async () => {
    setEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://x",
      NEXTAUTH_SECRET: "x".repeat(40),
    });
    const { env } = await import("@/lib/env");
    expect(env.DATABASE_URL).toBe("postgresql://x");
    expect(env.DIMONA_ENV).toBe("mock");
    expect(env.LOG_LEVEL).toBe("info");
  });
});
