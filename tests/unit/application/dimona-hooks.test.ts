import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  cancelIfAuto,
  declareInIfAuto,
  declareOutIfAuto,
} from "@/application/services/dimona-hooks";
import { DimonaService } from "@/application/services/dimona-service";
import { createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

vi.mock("@/application/services/dimona-service", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@/application/services/dimona-service")>();
  const Mocked = vi.fn().mockImplementation(() => ({
    declareIn: vi.fn().mockResolvedValue({ id: "d1" }),
    cancel: vi.fn().mockResolvedValue({ id: "d1" }),
    declareOut: vi.fn().mockResolvedValue({ id: "d1" }),
  }));
  Object.assign(Mocked, {
    shouldAutoDeclare: mod.DimonaService.shouldAutoDeclare,
  });
  return { ...mod, DimonaService: Mocked };
});

describe("dimona-hooks", () => {
  let db: PrismaMock;

  beforeEach(() => {
    db = createPrismaMock();
    vi.clearAllMocks();
  });

  it("declareInIfAuto skips non-auto contract types", async () => {
    db.user.findUnique.mockResolvedValue({ contractType: "EMPLOYEE" });
    await declareInIfAuto(db as unknown as PrismaClient, "s1", "u1");
    expect(DimonaService).not.toHaveBeenCalled();
  });

  it("declareInIfAuto calls DimonaService for FLEXI workers", async () => {
    db.user.findUnique.mockResolvedValue({ contractType: "FLEXI" });
    await declareInIfAuto(db as unknown as PrismaClient, "s1", "u1");
    expect(DimonaService).toHaveBeenCalledOnce();
    const instance = vi.mocked(DimonaService).mock.results[0]?.value as {
      declareIn: ReturnType<typeof vi.fn>;
    };
    expect(instance.declareIn).toHaveBeenCalledWith({
      shiftId: "s1",
      workerId: "u1",
    });
  });

  it("cancelIfAuto calls cancel for JOBSTUDENT workers", async () => {
    db.user.findUnique.mockResolvedValue({ contractType: "JOBSTUDENT" });
    await cancelIfAuto(db as unknown as PrismaClient, "s1", "u1");
    const instance = vi.mocked(DimonaService).mock.results[0]?.value as {
      cancel: ReturnType<typeof vi.fn>;
    };
    expect(instance.cancel).toHaveBeenCalledWith({
      shiftId: "s1",
      workerId: "u1",
    });
  });

  it("declareOutIfAuto calls declareOut for EXTRA workers", async () => {
    db.user.findUnique.mockResolvedValue({ contractType: "EXTRA" });
    await declareOutIfAuto(db as unknown as PrismaClient, "s1", "u1");
    const instance = vi.mocked(DimonaService).mock.results[0]?.value as {
      declareOut: ReturnType<typeof vi.fn>;
    };
    expect(instance.declareOut).toHaveBeenCalledWith({
      shiftId: "s1",
      workerId: "u1",
    });
  });
});
