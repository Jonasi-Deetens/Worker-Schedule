import { describe, expect, it } from "vitest";
import {
  decryptPii,
  decryptPiiNullable,
  encryptPii,
  encryptPiiNullable,
} from "@/infrastructure/crypto/pii";

describe("PII crypto (AES-256-GCM)", () => {
  it("round-trips an encrypted value", () => {
    const plain = "90010112345";
    const enc = encryptPii(plain);
    expect(enc).not.toBe(plain);
    expect(enc.split(".")).toHaveLength(3);
    expect(decryptPii(enc)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptPii("90010112345")).not.toBe(encryptPii("90010112345"));
  });

  it("tolerates legacy plaintext on decrypt (returns as-is)", () => {
    expect(decryptPii("90010112345")).toBe("90010112345");
  });

  it("returns malformed/non-wire values unchanged instead of throwing", () => {
    expect(decryptPii("not.valid.payload")).toBe("not.valid.payload");
    expect(decryptPii("plain text with spaces")).toBe("plain text with spaces");
  });

  it("nullable helpers pass through null/undefined", () => {
    expect(encryptPiiNullable(undefined)).toBeUndefined();
    expect(encryptPiiNullable(null)).toBeNull();
    expect(encryptPiiNullable("")).toBeNull();
    expect(decryptPiiNullable(null)).toBeNull();
    expect(decryptPiiNullable(undefined)).toBeNull();
  });

  it("nullable round-trip works for a real value", () => {
    const enc = encryptPiiNullable("12345678901") as string;
    expect(decryptPiiNullable(enc)).toBe("12345678901");
  });
});
