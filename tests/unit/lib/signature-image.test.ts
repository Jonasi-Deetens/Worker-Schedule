import { describe, expect, it } from "vitest";
import { parseSignaturePngBase64 } from "@/lib/signature-image";

function validSignatureDataUrl(): string {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}

describe("parseSignaturePngBase64", () => {
  it("accepts a data URL PNG", () => {
    const bytes = parseSignaturePngBase64(validSignatureDataUrl());
    expect(bytes.length).toBeGreaterThanOrEqual(50);
  });

  it("rejects empty signatures", () => {
    expect(() => parseSignaturePngBase64("data:image/png;base64,AAAA")).toThrow(
      "errors.signatureEmpty",
    );
  });
});
