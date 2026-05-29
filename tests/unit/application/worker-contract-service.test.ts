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

  it("send creates a SENT contract and notifies the worker", async () => {
    db.membership.findFirst.mockResolvedValue({ id: "m1" });
    db.workerContract.create.mockResolvedValue({
      id: "c1",
      status: "SENT",
      title: "Seasonal contract",
    });

    const result = await svc.send({
      businessId: "b1",
      userId: "u1",
      actorId: "owner1",
      title: "Seasonal contract",
      body: "Terms…",
    });

    expect(result.id).toBe("c1");
    expect(db.notification.create).toHaveBeenCalled();
    expect(db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_SENT" }),
      }),
    );
  });

  it("sign marks contract SIGNED with signature metadata", async () => {
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
  });

  it("hasSignedContract returns true when a SIGNED row exists", async () => {
    db.workerContract.findFirst.mockResolvedValue({ id: "c1" });
    await expect(svc.hasSignedContract("u1", "b1")).resolves.toBe(true);
  });
});
