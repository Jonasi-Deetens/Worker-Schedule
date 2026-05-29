import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DocumentService,
  MAX_UPLOAD_BYTES,
} from "@/application/services/document-service";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

let prisma: PrismaMock;
let service: DocumentService;

beforeEach(() => {
  prisma = createPrismaMock();
  service = new DocumentService(asPrisma(prisma));
});

const STORAGE_ENV = {
  STORAGE_ENDPOINT: "https://s3.example.com",
  STORAGE_REGION: "eu-west-1",
  STORAGE_BUCKET: "docs",
  STORAGE_ACCESS_KEY: "ak",
  STORAGE_SECRET_KEY: "sk",
} as const;

function withStorageConfigured() {
  Object.assign(process.env, STORAGE_ENV);
}

function clearStorageConfigured() {
  for (const key of Object.keys(STORAGE_ENV)) delete process.env[key];
}

describe("DocumentService.presignUpload", () => {
  afterEach(clearStorageConfigured);

  it("throws when object storage is not configured", () => {
    clearStorageConfigured();
    expect(() =>
      service.presignUpload({
        userId: "u1",
        fileName: "id.pdf",
        contentType: "application/pdf",
        sizeBytes: 1000,
      }),
    ).toThrow(/not configured/i);
  });

  it("rejects files larger than the 10 MiB cap", () => {
    withStorageConfigured();
    expect(() =>
      service.presignUpload({
        userId: "u1",
        fileName: "big.pdf",
        contentType: "application/pdf",
        sizeBytes: MAX_UPLOAD_BYTES + 1,
      }),
    ).toThrow(/larger than/i);
  });

  it("rejects disallowed content types", () => {
    withStorageConfigured();
    expect(() =>
      service.presignUpload({
        userId: "u1",
        fileName: "evil.exe",
        contentType: "application/x-msdownload",
        sizeBytes: 1000,
      }),
    ).toThrow(/not allowed/i);
  });

  it("namespaces the object key under the owning user id", () => {
    withStorageConfigured();
    const result = service.presignUpload({
      userId: "u1",
      fileName: "id card.pdf",
      contentType: "application/pdf",
      sizeBytes: 1000,
    });
    expect(result.key).toMatch(/^documents\/u1\//);
    // Unsafe filename characters are sanitised.
    expect(result.key).not.toContain(" ");
  });
});

describe("DocumentService.listForBusiness", () => {
  it("scopes to the business and filters by expiry horizon", async () => {
    prisma.document.findMany.mockResolvedValue([]);
    await service.listForBusiness("b1", { expiringWithinDays: 30 });
    const where = prisma.document.findMany.mock.calls[0][0].where;
    expect(where.user).toEqual({ businessId: "b1" });
    expect(where.expiresOn).toMatchObject({ not: null });
  });

  it("omits the expiry filter when no horizon is given", async () => {
    prisma.document.findMany.mockResolvedValue([]);
    await service.listForBusiness("b1");
    const where = prisma.document.findMany.mock.calls[0][0].where;
    expect(where.user).toEqual({ businessId: "b1" });
    expect(where.expiresOn).toBeUndefined();
  });
});

describe("DocumentService.delete", () => {
  it("rejects a manager deleting a document from another business (IDOR)", async () => {
    prisma.document.findUnique.mockResolvedValue({
      id: "doc-1",
      userId: "other-worker",
      user: { businessId: "other-biz" },
    });

    await expect(
      service.delete({
        id: "doc-1",
        userId: "manager-1",
        isOwnerOrManager: true,
        actingBusinessId: "my-biz",
      }),
    ).rejects.toThrow(/not found/i);
    expect(prisma.document.delete).not.toHaveBeenCalled();
  });

  it("lets a manager delete a document within their own business", async () => {
    prisma.document.findUnique.mockResolvedValue({
      id: "doc-1",
      userId: "worker-9",
      user: { businessId: "my-biz" },
    });
    prisma.document.delete.mockResolvedValue({ id: "doc-1" });

    await service.delete({
      id: "doc-1",
      userId: "manager-1",
      isOwnerOrManager: true,
      actingBusinessId: "my-biz",
    });

    expect(prisma.document.delete).toHaveBeenCalledWith({
      where: { id: "doc-1" },
    });
  });

  it("lets a worker delete their own document", async () => {
    prisma.document.findUnique.mockResolvedValue({
      id: "doc-1",
      userId: "worker-1",
      user: { businessId: "my-biz" },
    });
    prisma.document.delete.mockResolvedValue({ id: "doc-1" });

    await service.delete({
      id: "doc-1",
      userId: "worker-1",
      isOwnerOrManager: false,
      actingBusinessId: "my-biz",
    });

    expect(prisma.document.delete).toHaveBeenCalled();
  });

  it("blocks a worker deleting another worker's document", async () => {
    prisma.document.findUnique.mockResolvedValue({
      id: "doc-1",
      userId: "someone-else",
      user: { businessId: "my-biz" },
    });

    await expect(
      service.delete({
        id: "doc-1",
        userId: "worker-1",
        isOwnerOrManager: false,
        actingBusinessId: "my-biz",
      }),
    ).rejects.toThrow(/another user/i);
    expect(prisma.document.delete).not.toHaveBeenCalled();
  });
});
