import { hashSync } from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTH_ERROR,
  authorizeCredentials,
} from "@/infrastructure/auth/auth-options";
import { generateSecret, generateTotp } from "@/infrastructure/auth/totp";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

const PASSWORD = "correct-horse";
const PASSWORD_HASH = hashSync(PASSWORD, 10);

let prisma: PrismaMock;

beforeEach(() => {
  prisma = createPrismaMock();
});

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "a@b.com",
    name: "Ann",
    role: "WORKER",
    businessId: "biz-1",
    passwordHash: PASSWORD_HASH,
    status: "ACTIVE",
    twoFactorSecret: null,
    ...overrides,
  };
}

describe("authorizeCredentials", () => {
  it("returns null for an unknown email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await authorizeCredentials(
      { email: "a@b.com", password: PASSWORD },
      asPrisma(prisma),
    );
    expect(result).toBeNull();
  });

  it("returns null for a wrong password", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    const result = await authorizeCredentials(
      { email: "a@b.com", password: "wrong" },
      asPrisma(prisma),
    );
    expect(result).toBeNull();
  });

  it("rejects a non-ACTIVE (SUSPENDED) account", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ status: "SUSPENDED" }));
    await expect(
      authorizeCredentials(
        { email: "a@b.com", password: PASSWORD },
        asPrisma(prisma),
      ),
    ).rejects.toThrow(AUTH_ERROR.ACCOUNT_NOT_ACTIVE);
  });

  it("authorizes an active user without 2FA", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    const result = await authorizeCredentials(
      { email: "a@b.com", password: PASSWORD },
      asPrisma(prisma),
    );
    expect(result).toMatchObject({ id: "u1", role: "WORKER" });
  });

  describe("with 2FA enabled", () => {
    const secret = generateSecret();

    it("requires a TOTP code when one is omitted", async () => {
      prisma.user.findUnique.mockResolvedValue(
        baseUser({ twoFactorSecret: secret }),
      );
      await expect(
        authorizeCredentials(
          { email: "a@b.com", password: PASSWORD },
          asPrisma(prisma),
        ),
      ).rejects.toThrow(AUTH_ERROR.TOTP_REQUIRED);
    });

    it("rejects a wrong TOTP code", async () => {
      prisma.user.findUnique.mockResolvedValue(
        baseUser({ twoFactorSecret: secret }),
      );
      await expect(
        authorizeCredentials(
          { email: "a@b.com", password: PASSWORD, totp: "000000" },
          asPrisma(prisma),
        ),
      ).rejects.toThrow(AUTH_ERROR.TOTP_INVALID);
    });

    it("authorizes with the correct TOTP code", async () => {
      prisma.user.findUnique.mockResolvedValue(
        baseUser({ twoFactorSecret: secret }),
      );
      const code = generateTotp(secret);
      const result = await authorizeCredentials(
        { email: "a@b.com", password: PASSWORD, totp: code },
        asPrisma(prisma),
      );
      expect(result).toMatchObject({ id: "u1" });
    });
  });
});
