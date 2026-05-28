import { describe, expect, it } from "vitest";
import { TimeOffService } from "@/application/services/timeoff-service";
import { EmailService } from "@/application/services/email-service";
import { InMemoryEmailTransport } from "@/infrastructure/email/transport";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

describe("TimeOffService", () => {
  it("rejects requests where end <= start", async () => {
    const db = createPrismaMock();
    const svc = new TimeOffService(asPrisma(db));
    const t = new Date();
    await expect(
      svc.request({ userId: "u1", startsAt: t, endsAt: t }),
    ).rejects.toThrow(/must be after/i);
  });

  it("creates a request and audit event", async () => {
    const db = createPrismaMock();
    db.timeOffRequest.create.mockResolvedValue({ id: "tor1" });
    const svc = new TimeOffService(asPrisma(db));
    await svc.request({
      userId: "u1",
      startsAt: new Date("2026-06-01"),
      endsAt: new Date("2026-06-05"),
      reason: "Holiday",
    });
    expect(db.timeOffRequest.create).toHaveBeenCalled();
    expect(db.auditEvent.create).toHaveBeenCalled();
  });

  it("hasConflict returns true for an approved overlapping request", async () => {
    const db = createPrismaMock();
    db.timeOffRequest.findFirst.mockResolvedValue({ id: "to1" });
    const svc = new TimeOffService(asPrisma(db));
    expect(
      await svc.hasConflict("u1", new Date("2026-06-01"), new Date("2026-06-02")),
    ).toBe(true);
  });

  it("decide notifies the worker and emails when transport is configured", async () => {
    const db = createPrismaMock();
    const transport = new InMemoryEmailTransport();
    db.timeOffRequest.findFirst.mockResolvedValue({
      id: "tor1",
      userId: "u1",
      startsAt: new Date("2026-06-01"),
      endsAt: new Date("2026-06-03"),
      user: { id: "u1", name: "Worker", email: "w@e.com" },
    });
    db.timeOffRequest.update.mockResolvedValue({ id: "tor1", status: "APPROVED" });
    db.business.findUnique.mockResolvedValue({ id: "b1", name: "Cafe" });
    const svc = new TimeOffService(asPrisma(db), new EmailService(transport));
    await svc.decide({
      id: "tor1",
      ownerId: "owner1",
      businessId: "b1",
      approve: true,
    });
    expect(db.notification.create).toHaveBeenCalled();
    expect(transport.messages()).toHaveLength(1);
  });
});
