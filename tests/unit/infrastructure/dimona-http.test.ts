import { describe, expect, it, vi } from "vitest";
import { HttpDimonaAdapter } from "@/infrastructure/dimona/adapter";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HttpDimonaAdapter", () => {
  const input = {
    workerNiss: "92012312345",
    workerType: "FLX" as const,
    employerId: "0123456789",
    action: "IN" as const,
    startsAt: new Date("2026-06-01T09:00:00Z"),
    endsAt: new Date("2026-06-01T17:00:00Z"),
  };

  it("returns the dimona period id on 200", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse(200, { dimonaPeriodId: "DIM-42" }),
    );
    const adapter = new HttpDimonaAdapter({
      baseUrl: "https://acpt.test/REST/dimona/v1",
      token: "tok",
      fetcher: fetcher as unknown as typeof fetch,
    });
    const result = await adapter.declare(input);
    expect(result.ok).toBe(true);
    expect(result.dimonaPeriodId).toBe("DIM-42");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://acpt.test/REST/dimona/v1/declarations");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body as string);
    expect(body.worker.niss).toBe("92012312345");
    expect(body.action).toBe("IN");
  });

  it("surfaces structured errors from 4xx with errorCode", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(400, {
          errorCode: "DIM_INVALID_NISS",
          message: "NISS is malformed",
        }),
      );
    const adapter = new HttpDimonaAdapter({
      baseUrl: "https://acpt.test/REST/dimona/v1",
      token: "tok",
      fetcher: fetcher as unknown as typeof fetch,
    });
    const result = await adapter.declare(input);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("DIM_INVALID_NISS");
    expect(result.errorMessage).toBe("NISS is malformed");
  });

  it("falls back to HTTP_<status> when no errorCode", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    const adapter = new HttpDimonaAdapter({
      baseUrl: "https://acpt.test/REST/dimona/v1",
      token: "tok",
      fetcher: fetcher as unknown as typeof fetch,
    });
    const result = await adapter.declare(input);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("HTTP_503");
  });

  it("returns NETWORK_ERROR when fetch throws", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const adapter = new HttpDimonaAdapter({
      baseUrl: "https://acpt.test/REST/dimona/v1",
      token: "tok",
      fetcher: fetcher as unknown as typeof fetch,
    });
    const result = await adapter.declare(input);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("NETWORK_ERROR");
    expect(result.errorMessage).toBe("ECONNRESET");
  });
});
