import { describe, it, expect } from "vitest";
import { presignS3Put } from "@/infrastructure/storage/s3-presign";

describe("presignS3Put", () => {
  const baseInput = {
    endpoint: "https://s3.eu-west-1.amazonaws.com",
    region: "eu-west-1",
    bucket: "tg-uploads",
    key: "documents/u1/abc.pdf",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    expiresInSeconds: 600,
    now: () => new Date("2026-05-28T12:00:00Z"),
  };

  it("returns a URL in virtual-host style by default", () => {
    const out = presignS3Put({ ...baseInput, contentType: "application/pdf" });
    expect(out.url).toMatch(/^https:\/\/tg-uploads\.s3\.eu-west-1\.amazonaws\.com\/documents\/u1\/abc\.pdf\?/);
  });

  it("returns a URL in path style when forced (MinIO, IP)", () => {
    const out = presignS3Put({
      ...baseInput,
      forcePathStyle: true,
      contentType: "application/pdf",
    });
    expect(out.url).toMatch(/^https:\/\/s3\.eu-west-1\.amazonaws\.com\/tg-uploads\/documents\/u1\/abc\.pdf\?/);
  });

  it("includes the SigV4 query parameters", () => {
    const out = presignS3Put({ ...baseInput, contentType: "application/pdf" });
    const u = new URL(out.url);
    expect(u.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("signs without Content-Type when omitted", () => {
    const out = presignS3Put({ ...baseInput });
    expect(out.headers["Content-Type"]).toBeUndefined();
    const u = new URL(out.url);
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });

  it("produces deterministic signatures for identical inputs", () => {
    const a = presignS3Put({ ...baseInput, contentType: "application/pdf" });
    const b = presignS3Put({ ...baseInput, contentType: "application/pdf" });
    expect(a.url).toBe(b.url);
  });

  it("produces different signatures when the key changes", () => {
    const a = presignS3Put({ ...baseInput, contentType: "application/pdf" });
    const b = presignS3Put({
      ...baseInput,
      key: "documents/u1/other.pdf",
      contentType: "application/pdf",
    });
    expect(a.url).not.toBe(b.url);
  });
});
