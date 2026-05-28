import { describe, it, expect } from "vitest";
import { checkIdempotency } from "@/infrastructure/idempotency";

describe("checkIdempotency", () => {
  it("returns a miss the first time a key is seen", () => {
    const store = new Map();
    const result = checkIdempotency({
      apiKeyId: "key1",
      idempotencyKey: "abc",
      body: '{"hello":1}',
      store,
    });
    expect(result.kind).toBe("miss");
  });

  it("replays the original response on a matching retry", () => {
    const store = new Map();
    const first = checkIdempotency({
      apiKeyId: "key1",
      idempotencyKey: "abc",
      body: '{"hello":1}',
      store,
    });
    if (first.kind !== "miss") throw new Error("expected miss");
    first.remember(201, '{"data":"ok"}');

    const second = checkIdempotency({
      apiKeyId: "key1",
      idempotencyKey: "abc",
      body: '{"hello":1}',
      store,
    });
    expect(second.kind).toBe("hit");
    if (second.kind === "hit") {
      expect(second.status).toBe(201);
      expect(second.body).toBe('{"data":"ok"}');
    }
  });

  it("returns conflict when the same key is re-used with a different body", () => {
    const store = new Map();
    const first = checkIdempotency({
      apiKeyId: "key1",
      idempotencyKey: "abc",
      body: '{"a":1}',
      store,
    });
    if (first.kind !== "miss") throw new Error("expected miss");
    first.remember(201, '{"ok":true}');

    const second = checkIdempotency({
      apiKeyId: "key1",
      idempotencyKey: "abc",
      body: '{"a":2}',
      store,
    });
    expect(second.kind).toBe("conflict");
  });

  it("scopes keys by api key id", () => {
    const store = new Map();
    const a = checkIdempotency({
      apiKeyId: "k1",
      idempotencyKey: "abc",
      body: "x",
      store,
    });
    if (a.kind !== "miss") throw new Error("expected miss");
    a.remember(200, "first");

    const b = checkIdempotency({
      apiKeyId: "k2",
      idempotencyKey: "abc",
      body: "x",
      store,
    });
    expect(b.kind).toBe("miss");
  });

  it("expires entries after ttl", () => {
    const store = new Map();
    let now = 1000;
    const first = checkIdempotency({
      apiKeyId: "k1",
      idempotencyKey: "abc",
      body: "x",
      store,
      ttlMs: 100,
      now: () => now,
    });
    if (first.kind !== "miss") throw new Error("expected miss");
    first.remember(200, "old");

    now = 1500;
    const second = checkIdempotency({
      apiKeyId: "k1",
      idempotencyKey: "abc",
      body: "x",
      store,
      ttlMs: 100,
      now: () => now,
    });
    expect(second.kind).toBe("miss");
  });
});
