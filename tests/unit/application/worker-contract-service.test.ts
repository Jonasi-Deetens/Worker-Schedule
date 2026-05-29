import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerContractService } from "@/application/services/worker-contract-service";
import {
  asPrisma,
  createPrismaMock,
  type PrismaMock,
} from "../../helpers/mock-prisma";

vi.mock("@/infrastructure/events/bus", () => ({
  publish: vi.fn(),
}));

describe("WorkerContractService", () => {
  let db: PrismaMock;
  let svc: WorkerContractService;

  beforeEach(() => {
    db = createPrismaMock();
    svc = new WorkerContractService(asPrisma(db));
  });

  it("send creates a SENT contract, snapshots data, persists a PDF hash and notifies the worker", async () => {
    db.membership.findFirst.mockResolvedValue({ id: "m1" });
    db.business.findUnique.mockResolvedValue({
      name: "Cafe BV",
      dimonaEmployerId: "RSZ-1",
    });
    db.user.findUnique.mockResolvedValue({
      name: "Jane Doe",
      nationalNumber: "90010112345",
      addressLine: "Main St 1",
      postalCode: "1000",
      city: "Brussels",
    });
    db.workerContract.create.mockImplementation(async ({ data }) => ({
      id: "c1",
      ...data,
    }));

    const result = await svc.send({
      businessId: "b1",
      userId: "u1",
      actorId: "owner1",
      title: "Seasonal contract",
      body: "Terms…",
      contractType: "JOBSTUDENT",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-08-31"),
      scheduleText: "Sat & Sun 10:00-18:00",
      hourlyWageCents: 1450,
      jobDescription: "Bartender",
    });

    expect(result.id).toBe("c1");
    const created = db.workerContract.create.mock.calls[0][0].data;
    // sha256 hex is 64 chars — proves the PDF was generated and hashed.
    expect(created.pdfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.studentSnapshot).toMatchObject({ nationalNumber: "90010112345" });
    expect(created.employerSnapshot).toMatchObject({ name: "Cafe BV" });
    expect(db.notification.create).toHaveBeenCalled();
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_SENT" }),
      }),
    );
  });

  it("send rejects a contract longer than 12 months", async () => {
    db.membership.findFirst.mockResolvedValue({ id: "m1" });

    await expect(
      svc.send({
        businessId: "b1",
        userId: "u1",
        actorId: "owner1",
        title: "Too long",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-02-01"),
      }),
    ).rejects.toThrow("errors.contractTooLong");
    expect(db.workerContract.create).not.toHaveBeenCalled();
  });

  it("sign marks contract SIGNED with signature metadata and audits a timestamp", async () => {
    db.workerContract.findFirst.mockResolvedValue({
      id: "c1",
      status: "SENT",
    });
    db.workerContract.update.mockResolvedValue({
      id: "c1",
      status: "SIGNED",
      signatureName: "Jane Doe",
    });

    const result = await svc.sign({
      contractId: "c1",
      userId: "u1",
      businessId: "b1",
      signatureName: "Jane Doe",
      signatureIp: "127.0.0.1",
    });

    expect(result.status).toBe("SIGNED");
    expect(db.workerContract.update.mock.calls[0][0].data.signatureName).toBe(
      "Jane Doe",
    );
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CONTRACT_SIGNED",
          metadata: expect.objectContaining({
            signedAt: expect.any(String),
          }),
        }),
      }),
    );
  });

  it("sign refuses an already-signed (immutable) contract", async () => {
    // A SIGNED contract never matches the `status: SENT` filter, so the lookup
    // returns null and the signature stays immutable.
    db.workerContract.findFirst.mockResolvedValue(null);

    await expect(
      svc.sign({
        contractId: "c1",
        userId: "u1",
        businessId: "b1",
        signatureName: "Jane Doe",
      }),
    ).rejects.toThrow(/not awaiting signature/);
    expect(db.workerContract.update).not.toHaveBeenCalled();
  });

  it("hasSignedContract returns true when a SIGNED row exists", async () => {
    db.workerContract.findFirst.mockResolvedValue({ id: "c1" });
    await expect(svc.hasSignedContract("u1", "b1")).resolves.toBe(true);
  });
});
