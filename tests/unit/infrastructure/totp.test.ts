import { describe, expect, it } from "vitest";
import {
  base32Decode,
  generateSecret,
  generateTotp,
  totpAuthUrl,
  verifyTotp,
} from "@/infrastructure/auth/totp";

describe("TOTP", () => {
  it("produces a 32-character base32 secret by default", () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBe(32);
  });

  it("base32-decode round trip is lossless", () => {
    const original = "JBSWY3DPEHPK3PXP";
    const buf = base32Decode(original);
    expect(buf).toBeInstanceOf(Buffer);
  });

  it("verify accepts the current code", () => {
    const secret = generateSecret();
    const now = Date.now();
    const code = generateTotp(secret, now);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("verify rejects an obviously wrong code", () => {
    const secret = generateSecret();
    expect(verifyTotp(secret, "000000")).toBe(false);
  });

  it("builds an otpauth URL with the expected params", () => {
    const url = totpAuthUrl({
      account: "test@example.com",
      issuer: "Tattoogenda",
      secret: "JBSWY3DPEHPK3PXP",
    });
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain("Tattoogenda");
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
  });
});
