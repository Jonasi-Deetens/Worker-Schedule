import { describe, expect, it, vi } from "vitest";
import {
  deleteObject,
  objectKeyFromUrl,
  presignS3Delete,
} from "@/infrastructure/storage/s3-delete";

const baseInput = {
  endpoint: "https://s3.eu-west-1.amazonaws.com",
  region: "eu-west-1",
  bucket: "tg-uploads",
  key: "documents/u1/abc.pdf",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  now: () => new Date("2026-05-28T12:00:00Z"),
};

describe("presignS3Delete", () => {
  it("builds a virtual-host DELETE URL with SigV4 params", () => {
    const url = presignS3Delete(baseInput);
    expect(url).toMatch(
      /^https:\/\/tg-uploads\.s3\.eu-west-1\.amazonaws\.com\/documents\/u1\/abc\.pdf\?/,
    );
    const u = new URL(url);
    expect(u.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds a path-style URL when forced (MinIO)", () => {
    const url = presignS3Delete({ ...baseInput, forcePathStyle: true });
    expect(url).toMatch(
      /^https:\/\/s3\.eu-west-1\.amazonaws\.com\/tg-uploads\/documents\/u1\/abc\.pdf\?/,
    );
  });

  it("is deterministic for identical inputs", () => {
    expect(presignS3Delete(baseInput)).toBe(presignS3Delete(baseInput));
  });
});

describe("objectKeyFromUrl", () => {
  it("extracts the key from a virtual-host URL", () => {
    const key = objectKeyFromUrl(
      "https://tg-uploads.s3.eu-west-1.amazonaws.com/documents/u1/abc.pdf",
      { bucket: "tg-uploads" },
    );
    expect(key).toBe("documents/u1/abc.pdf");
  });

  it("strips the bucket prefix from a path-style URL", () => {
    const key = objectKeyFromUrl(
      "https://minio.local/tg-uploads/documents/u1/abc.pdf",
      { bucket: "tg-uploads", forcePathStyle: true },
    );
    expect(key).toBe("documents/u1/abc.pdf");
  });

  it("returns null for a non-URL", () => {
    expect(objectKeyFromUrl("not a url", { bucket: "tg-uploads" })).toBeNull();
  });
});

describe("deleteObject", () => {
  it("issues a signed DELETE and resolves true on 2xx", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const ok = await deleteObject(baseInput, fetcher as unknown as typeof fetch);
    expect(ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, opts] = fetcher.mock.calls[0];
    expect(opts.method).toBe("DELETE");
    expect(String(url)).toContain("X-Amz-Signature=");
  });

  it("treats a 404 as already-deleted", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    expect(await deleteObject(baseInput, fetcher as unknown as typeof fetch)).toBe(
      true,
    );
  });

  it("resolves false on a non-2xx, non-404 response", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    expect(await deleteObject(baseInput, fetcher as unknown as typeof fetch)).toBe(
      false,
    );
  });
});
