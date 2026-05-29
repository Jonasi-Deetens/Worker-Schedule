import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  RszRestDimonaAdapter,
  SocialSecretariatDimonaAdapter,
} from "@/infrastructure/dimona/adapter";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const stuInput = {
  workerNiss: "90010112345",
  workerType: "STU" as const,
  employerId: "RSZ-1",
  action: "IN" as const,
  startsAt: new Date("2026-07-01T00:00:00Z"),
  endsAt: new Date("2026-10-01T00:00:00Z"),
  plannedHours: 120,
  quarter: 3,
  year: 2026,
};

describe("RszRestDimonaAdapter", () => {
  it("exchanges a client-assertion for a token, then POSTs the declaration", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "tok-123", expires_in: 300 }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { dimonaPeriodId: "DIM-STU-9" }));

    const adapter = new RszRestDimonaAdapter({
      baseUrl: "https://sim.test/REST/dimona/v2",
      oauthUrl: "https://sim.test/REST/oauth/v5/token",
      clientId: "client-1",
      privateKeyPem: privateKey,
      fetcher: fetcher as unknown as typeof fetch,
    });

    const result = await adapter.declare(stuInput);
    expect(result.ok).toBe(true);
    expect(result.dimonaPeriodId).toBe("DIM-STU-9");

    // First call: OAuth token endpoint with a JWT-bearer client assertion.
    const [tokenUrl, tokenInit] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe("https://sim.test/REST/oauth/v5/token");
    const tokenBody = String(tokenInit.body);
    expect(tokenBody).toContain("grant_type=client_credentials");
    expect(tokenBody).toContain(
      "client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer",
    );
    expect(tokenBody).toContain("client_assertion=");

    // Second call: the declaration with bearer token + planned hours.
    const [declUrl, declInit] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(declUrl).toBe("https://sim.test/REST/dimona/v2/declarations");
    const headers = declInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-123");
    const sent = JSON.parse(String(declInit.body));
    expect(sent.worker.type).toBe("STU");
    expect(sent.plannedHours).toBe(120);
    expect(sent.quarter).toBe(3);
    expect(sent.year).toBe(2026);
  });

  it("caches the token across declarations", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "tok-abc", expires_in: 3600 }),
      )
      .mockResolvedValue(jsonResponse(200, { dimonaPeriodId: "DIM-1" }));

    const adapter = new RszRestDimonaAdapter({
      baseUrl: "https://sim.test/REST/dimona/v2",
      oauthUrl: "https://sim.test/REST/oauth/v5/token",
      clientId: "client-1",
      privateKeyPem: privateKey,
      fetcher: fetcher as unknown as typeof fetch,
    });

    await adapter.declare(stuInput);
    await adapter.declare(stuInput);
    // 1 token call + 2 declaration calls = 3 (token reused).
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("maps an OAuth failure to a structured error without throwing", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: "invalid_client" }));
    const adapter = new RszRestDimonaAdapter({
      baseUrl: "https://sim.test/REST/dimona/v2",
      oauthUrl: "https://sim.test/REST/oauth/v5/token",
      clientId: "client-1",
      privateKeyPem: privateKey,
      fetcher: fetcher as unknown as typeof fetch,
    });
    const result = await adapter.declare(stuInput);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("invalid_client");
  });

  it("returns NETWORK_ERROR when the token request throws", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    const adapter = new RszRestDimonaAdapter({
      baseUrl: "https://sim.test/REST/dimona/v2",
      oauthUrl: "https://sim.test/REST/oauth/v5/token",
      clientId: "client-1",
      privateKeyPem: privateKey,
      fetcher: fetcher as unknown as typeof fetch,
    });
    const result = await adapter.declare(stuInput);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("NETWORK_ERROR");
  });
});

describe("SocialSecretariatDimonaAdapter", () => {
  it("returns a safe NOT_CONFIGURED result (never throws, never fakes success)", async () => {
    const adapter = new SocialSecretariatDimonaAdapter({ provider: "securex" });
    const result = await adapter.declare();
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("NOT_CONFIGURED");
    expect(result.errorMessage).toContain("securex");
  });
});
