import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the shared service singletons so the public register procedure never
// touches Prisma — we only want to exercise the rate-limit guard here.
const { registerMock } = vi.hoisted(() => ({ registerMock: vi.fn() }));
vi.mock("@/interface/trpc/services", () => ({
  authService: { register: registerMock },
}));

import { authRouter } from "@/interface/trpc/routers/auth";
import { AUTH_RATE_LIMIT } from "@/infrastructure/rate-limit";

describe("authRouter.register rate limiting", () => {
  beforeEach(() => {
    registerMock.mockReset();
    registerMock.mockResolvedValue({ userId: "u1", businessId: "b1" });
  });

  it("allows up to the limit then rejects with TOO_MANY_REQUESTS", async () => {
    const caller = authRouter.createCaller({ session: null, ip: "203.0.113.9" });
    // A stable key (same ip + email) so every call lands in the same bucket.
    const input = {
      email: `ratelimit-${Date.now()}@example.com`,
      password: "password123",
      name: "Rate Limited",
      role: "OWNER" as const,
      businessName: "Biz",
    };

    for (let i = 0; i < AUTH_RATE_LIMIT.limit; i += 1) {
      await caller.register({ ...input });
    }
    expect(registerMock).toHaveBeenCalledTimes(AUTH_RATE_LIMIT.limit);

    await expect(caller.register({ ...input })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    // The blocked request must never reach the service.
    expect(registerMock).toHaveBeenCalledTimes(AUTH_RATE_LIMIT.limit);
  });
});
