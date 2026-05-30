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

function fakeSignatureDataUrl(): string {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}

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
      addressLine: "Rue 1",
      postalCode: "1000",
      city: "Brussels",
      cbeNumber: "BE0123456789",
      contractTemplateUrlNl: null,
      contractTemplateUrlFr: null,
    });
    db.user.findUnique.mockResolvedValue({
      name: "Jane Doe",
      contractType: "JOBSTUDENT",
      nationalNumber: "90010112345",
      addressLine: "Main St 1",
      postalCode: "1000",
      city: "Brussels",
      birthDate: null,
      iban: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      hourlyRate: null,
    });
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    db.shiftAssignment.findMany.mockResolvedValue([]);
    db.workerContract.create.mockImplementation(async ({ data }) => ({
      id: "c1",
      ...data,
    }));

    const result = await svc.send({
      businessId: "b1",
      userId: "u1",
      actorId: "owner1",
      title: "Seasonal contract",
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

  it("send rejects incomplete data when a custom template is configured", async () => {
    db.membership.findFirst.mockResolvedValue({ id: "m1" });
    db.business.findUnique.mockResolvedValue({
      name: "Cafe BV",
      dimonaEmployerId: "RSZ-1",
      addressLine: null,
      postalCode: null,
      city: null,
      cbeNumber: null,
      contractTemplateUrlNl: "https://s3/template.pdf",
      contractTemplateUrlFr: null,
    });
    db.user.findUnique.mockResolvedValue({
      name: "Jane",
      contractType: "JOBSTUDENT",
      nationalNumber: null,
      addressLine: null,
      postalCode: null,
      city: null,
      birthDate: null,
      iban: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      hourlyRate: null,
    });
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    db.shiftAssignment.findMany.mockResolvedValue([]);

    await expect(
      svc.send({
        businessId: "b1",
        userId: "u1",
        actorId: "owner1",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2026-08-31"),
      }),
    ).rejects.toThrow("errors.contractIncomplete");
  });

  it("send rejects a contract longer than 12 months", async () => {
    db.membership.findFirst.mockResolvedValue({ id: "m1" });
    db.business.findUnique.mockResolvedValue({
      name: "Cafe",
      dimonaEmployerId: "RSZ",
      addressLine: "A",
      postalCode: "1000",
      city: "B",
      cbeNumber: "BE1",
      contractTemplateUrlNl: null,
      contractTemplateUrlFr: null,
    });
    db.user.findUnique.mockResolvedValue({
      name: "Jane",
      contractType: "JOBSTUDENT",
      nationalNumber: "90010112345",
      addressLine: "S",
      postalCode: "9000",
      city: "G",
      birthDate: null,
      iban: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      hourlyRate: null,
    });
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    db.shiftAssignment.findMany.mockResolvedValue([]);

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

  it("signAsWorker moves contract to WORKER_SIGNED and notifies owner", async () => {
    db.workerContract.findFirst.mockResolvedValue({
      id: "c1",
      status: "SENT",
      title: "Student agreement",
    });
    db.business.findUnique.mockResolvedValue({ ownerId: "owner1", name: "Cafe" });
    db.workerContract.update.mockImplementation(async ({ data }) => ({
      id: "c1",
      ...data,
    }));

    const result = await svc.signAsWorker({
      contractId: "c1",
      userId: "u1",
      businessId: "b1",
      signaturePngBase64: fakeSignatureDataUrl(),
      signerLabel: "Jane Doe",
      signatureIp: "127.0.0.1",
    });

    expect(result.status).toBe("WORKER_SIGNED");
    expect(db.workerContract.update.mock.calls[0][0].data.studentSignerLabel).toBe(
      "Jane Doe",
    );
    expect(db.workerContract.update.mock.calls[0][0].data.studentSignatureUrl).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_WORKER_SIGNED" }),
      }),
    );
    expect(db.notification.create).toHaveBeenCalled();
  });

  it("signAsEmployer finalizes contract to SIGNED", async () => {
    const studentUrl = fakeSignatureDataUrl();
    db.workerContract.findFirst.mockResolvedValue({
      id: "c1",
      userId: "u1",
      status: "WORKER_SIGNED",
      title: "Student agreement",
      contractType: "JOBSTUDENT",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-08-31"),
      scheduleText: "Weekends",
      hourlyWageCents: 1450,
      jobDescription: "Bartender",
      studentSignatureUrl: studentUrl,
      pdfUrl: null,
      pdfHash: null,
    });
    db.business.findUnique.mockResolvedValue({
      contractTemplateUrlNl: null,
      contractTemplateUrlFr: null,
    });
    db.user.findUnique.mockResolvedValue({
      name: "Jane Doe",
      contractType: "JOBSTUDENT",
      nationalNumber: "90010112345",
      addressLine: "Main St 1",
      postalCode: "1000",
      city: "Brussels",
      birthDate: null,
      iban: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      hourlyRate: null,
    });
    db.shiftAssignment.findFirst.mockResolvedValue(null);
    db.shiftAssignment.findMany.mockResolvedValue([]);
    db.workerContract.update.mockResolvedValue({
      id: "c1",
      status: "SIGNED",
    });

    const result = await svc.signAsEmployer({
      contractId: "c1",
      actorId: "owner1",
      businessId: "b1",
      signaturePngBase64: fakeSignatureDataUrl(),
      signerLabel: "Owner Name",
    });

    expect(result.status).toBe("SIGNED");
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_EMPLOYER_SIGNED" }),
      }),
    );
  });

  it("signAsWorker refuses when contract is not SENT", async () => {
    db.workerContract.findFirst.mockResolvedValue(null);

    await expect(
      svc.signAsWorker({
        contractId: "c1",
        userId: "u1",
        businessId: "b1",
        signaturePngBase64: fakeSignatureDataUrl(),
      }),
    ).rejects.toThrow(/not awaiting signature/);
    expect(db.workerContract.update).not.toHaveBeenCalled();
  });

  it("hasSignedContract returns true when a SIGNED row exists", async () => {
    db.workerContract.findFirst.mockResolvedValue({ id: "c1" });
    await expect(svc.hasSignedContract("u1", "b1")).resolves.toBe(true);
  });
});
