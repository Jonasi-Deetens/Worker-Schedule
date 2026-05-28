import { describe, expect, it } from "vitest";
import { rateLimit } from "@/infrastructure/rate-limit";

describe("rateLimit", () => {
  it("allows requests up to the limit", () => {
    const store = new Map();
    const opts = { key: "u", limit: 3, windowMs: 1000, store, now: () => 0 };
    expect(rateLimit(opts).allowed).toBe(true);
    expect(rateLimit(opts).allowed).toBe(true);
    expect(rateLimit(opts).allowed).toBe(true);
    expect(rateLimit(opts).allowed).toBe(false);
  });

  it("decrements remaining on each call", () => {
    const store = new Map();
    expect(
      rateLimit({ key: "u", limit: 2, windowMs: 1000, store, now: () => 0 })
        .remaining,
    ).toBe(1);
    expect(
      rateLimit({ key: "u", limit: 2, windowMs: 1000, store, now: () => 0 })
        .remaining,
    ).toBe(0);
  });

  it("opens a fresh window after the period elapses", () => {
    const store = new Map();
    rateLimit({ key: "u", limit: 1, windowMs: 1000, store, now: () => 0 });
    const second = rateLimit({
      key: "u",
      limit: 1,
      windowMs: 1000,
      store,
      now: () => 0,
    });
    expect(second.allowed).toBe(false);
    const third = rateLimit({
      key: "u",
      limit: 1,
      windowMs: 1000,
      store,
      now: () => 1500,
    });
    expect(third.allowed).toBe(true);
  });

  it("scopes buckets by key", () => {
    const store = new Map();
    expect(
      rateLimit({ key: "a", limit: 1, windowMs: 1000, store, now: () => 0 })
        .allowed,
    ).toBe(true);
    expect(
      rateLimit({ key: "b", limit: 1, windowMs: 1000, store, now: () => 0 })
        .allowed,
    ).toBe(true);
  });
});
