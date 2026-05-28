import { describe, expect, it } from "vitest";
import { TotpAccountService } from "@/application/services/totp-account-service";
import { generateTotp } from "@/infrastructure/auth/totp";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

describe("TotpAccountService.setup", () => {
  it("returns a fresh secret + otpauth URL but does NOT persist", () => {
    const db = createPrismaMock();
    const svc = new TotpAccountService(asPrisma(db));
    const { secret, otpauthUrl } = svc.setup("user@x.io");
    expect(secret.length).toBeGreaterThan(16);
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUrl).toContain(encodeURIComponent("Work Calendar:user@x.io"));
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("TotpAccountService.enable", () => {
  it("rejects an invalid code", async () => {
    const db = createPrismaMock();
    const svc = new TotpAccountService(asPrisma(db));
    const secret = svc.setup("user@x.io").secret;
    await expect(
      svc.enable({ userId: "u1", secret, token: "000000" }),
    ).rejects.toThrow(/invalid code/i);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("persists the secret when the code matches", async () => {
    const db = createPrismaMock();
    db.user.update.mockResolvedValue({ id: "u1" });
    const svc = new TotpAccountService(asPrisma(db));
    const secret = svc.setup("user@x.io").secret;
    const token = generateTotp(secret);
    const result = await svc.enable({ userId: "u1", secret, token });
    expect(result).toEqual({ success: true });
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { twoFactorSecret: secret },
      }),
    );
  });
});

describe("TotpAccountService.disable", () => {
  it("clears twoFactorSecret on the user row", async () => {
    const db = createPrismaMock();
    db.user.update.mockResolvedValue({ id: "u1" });
    const svc = new TotpAccountService(asPrisma(db));
    await svc.disable("u1");
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { twoFactorSecret: null },
      }),
    );
  });
});
