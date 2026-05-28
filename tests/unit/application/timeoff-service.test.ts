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

  describe("cancel", () => {
    it("cancels a PENDING request, writes audit, no owner notify", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue({
        id: "tor1",
        userId: "u1",
        status: "PENDING",
        startsAt: new Date("2026-06-01"),
        endsAt: new Date("2026-06-02"),
        user: { id: "u1", name: "Worker", businessId: "b1" },
      });
      db.timeOffRequest.update.mockResolvedValue({
        id: "tor1",
        status: "CANCELLED",
      });
      const svc = new TimeOffService(asPrisma(db));

      await svc.cancel({ id: "tor1", userId: "u1" });

      expect(db.timeOffRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "CANCELLED" }),
        }),
      );
      expect(db.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "TIMEOFF_CANCELLED" }),
        }),
      );
      // PENDING → owner not notified.
      expect(db.notification.create).not.toHaveBeenCalled();
    });

    it("cancels an APPROVED request and notifies the owner", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue({
        id: "tor1",
        userId: "u1",
        status: "APPROVED",
        startsAt: new Date("2026-06-01"),
        endsAt: new Date("2026-06-02"),
        user: { id: "u1", name: "Worker", businessId: "b1" },
      });
      db.timeOffRequest.update.mockResolvedValue({
        id: "tor1",
        status: "CANCELLED",
      });
      db.business.findUnique.mockResolvedValue({ id: "b1", ownerId: "owner1" });
      const svc = new TimeOffService(asPrisma(db));

      await svc.cancel({ id: "tor1", userId: "u1" });

      expect(db.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "TIMEOFF_CANCELLED" }),
        }),
      );
      expect(db.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "owner1",
            type: "TIMEOFF_DECIDED",
          }),
        }),
      );
    });

    it("rejects cancel when status is REJECTED", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue({
        id: "tor1",
        userId: "u1",
        status: "REJECTED",
        startsAt: new Date("2026-06-01"),
        endsAt: new Date("2026-06-02"),
        user: { id: "u1", name: "Worker", businessId: "b1" },
      });
      const svc = new TimeOffService(asPrisma(db));

      await expect(svc.cancel({ id: "tor1", userId: "u1" })).rejects.toThrow(
        /Cannot cancel/i,
      );
      expect(db.timeOffRequest.update).not.toHaveBeenCalled();
    });

    it("rejects cancel when already CANCELLED", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue({
        id: "tor1",
        userId: "u1",
        status: "CANCELLED",
        startsAt: new Date("2026-06-01"),
        endsAt: new Date("2026-06-02"),
        user: { id: "u1", name: "Worker", businessId: "b1" },
      });
      const svc = new TimeOffService(asPrisma(db));

      await expect(svc.cancel({ id: "tor1", userId: "u1" })).rejects.toThrow(
        /Cannot cancel/i,
      );
    });
  });

  describe("update", () => {
    it("keeps PENDING as PENDING and does not touch decidedById", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue({
        id: "tor1",
        userId: "u1",
        status: "PENDING",
      });
      db.timeOffRequest.update.mockResolvedValue({ id: "tor1" });
      const svc = new TimeOffService(asPrisma(db));

      await svc.update({
        id: "tor1",
        userId: "u1",
        startsAt: new Date("2026-06-10"),
        endsAt: new Date("2026-06-12"),
        reason: "Updated reason",
      });

      const call = db.timeOffRequest.update.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(call.data.status).toBeUndefined();
      expect(call.data.decidedById).toBeUndefined();
      expect(call.data.decidedAt).toBeUndefined();
      expect(call.data.reason).toBe("Updated reason");
      expect(db.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "TIMEOFF_UPDATED" }),
        }),
      );
    });

    it("resets APPROVED to PENDING and clears decided fields", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue({
        id: "tor1",
        userId: "u1",
        status: "APPROVED",
      });
      db.timeOffRequest.update.mockResolvedValue({ id: "tor1" });
      const svc = new TimeOffService(asPrisma(db));

      await svc.update({
        id: "tor1",
        userId: "u1",
        startsAt: new Date("2026-06-10"),
        endsAt: new Date("2026-06-12"),
      });

      expect(db.timeOffRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PENDING",
            decidedById: null,
            decidedAt: null,
          }),
        }),
      );
    });

    it("rejects update when end <= start", async () => {
      const db = createPrismaMock();
      const svc = new TimeOffService(asPrisma(db));
      const t = new Date();
      await expect(
        svc.update({ id: "tor1", userId: "u1", startsAt: t, endsAt: t }),
      ).rejects.toThrow(/must be after/i);
    });

    it("rejects update when status is REJECTED", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue({
        id: "tor1",
        userId: "u1",
        status: "REJECTED",
      });
      const svc = new TimeOffService(asPrisma(db));
      await expect(
        svc.update({
          id: "tor1",
          userId: "u1",
          startsAt: new Date("2026-06-10"),
          endsAt: new Date("2026-06-12"),
        }),
      ).rejects.toThrow(/Cannot edit/i);
    });
  });

  describe("revoke", () => {
    it("revokes an APPROVED request, audits, notifies and emails the worker", async () => {
      const db = createPrismaMock();
      const transport = new InMemoryEmailTransport();
      db.timeOffRequest.findFirst.mockResolvedValue({
        id: "tor1",
        userId: "u1",
        status: "APPROVED",
        startsAt: new Date("2026-06-01"),
        endsAt: new Date("2026-06-03"),
        user: { id: "u1", name: "Worker", email: "w@e.com" },
      });
      db.timeOffRequest.update.mockResolvedValue({
        id: "tor1",
        status: "CANCELLED",
      });
      db.business.findUnique.mockResolvedValue({ id: "b1", name: "Cafe" });
      const svc = new TimeOffService(asPrisma(db), new EmailService(transport));

      await svc.revoke({ id: "tor1", ownerId: "owner1", businessId: "b1" });

      expect(db.timeOffRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CANCELLED",
            decidedById: "owner1",
          }),
        }),
      );
      expect(db.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "TIMEOFF_REVOKED" }),
        }),
      );
      expect(db.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "u1",
            type: "TIMEOFF_DECIDED",
          }),
        }),
      );
      expect(transport.messages()).toHaveLength(1);
    });

    it("rejects revoke when status is PENDING", async () => {
      const db = createPrismaMock();
      db.timeOffRequest.findFirst.mockResolvedValue({
        id: "tor1",
        userId: "u1",
        status: "PENDING",
        startsAt: new Date("2026-06-01"),
        endsAt: new Date("2026-06-03"),
        user: { id: "u1", name: "Worker", email: "w@e.com" },
      });
      const svc = new TimeOffService(asPrisma(db));
      await expect(
        svc.revoke({ id: "tor1", ownerId: "owner1", businessId: "b1" }),
      ).rejects.toThrow(/Can only revoke/i);
    });
  });
});
