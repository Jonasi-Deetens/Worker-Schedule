import { describe, expect, it } from "vitest";
import {
  parseLocationTokenId,
  signLocationToken,
  verifyLocationToken,
} from "@/lib/location-token";

describe("location QR token", () => {
  const secret = "per-location-secret";

  it("verifies a token it signed", () => {
    const token = signLocationToken("loc123", secret);
    expect(parseLocationTokenId(token)).toBe("loc123");
    expect(verifyLocationToken(token, secret)).toBe(true);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signLocationToken("loc123", "other-secret");
    expect(verifyLocationToken(token, secret)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = signLocationToken("loc123", secret);
    const tampered = `${token}x`;
    expect(verifyLocationToken(tampered, secret)).toBe(false);
  });

  it("rejects malformed tokens", () => {
    expect(parseLocationTokenId("nodot")).toBeNull();
    expect(verifyLocationToken("nodot", secret)).toBe(false);
    expect(verifyLocationToken("", secret)).toBe(false);
  });
});
