import { describe, expect, it, beforeEach } from "vitest";
import { InviteService, generateInviteToken } from "@/application/services/invite-service";
import { EmailService } from "@/application/services/email-service";
import { InMemoryEmailTransport, __setEmailTransportForTests } from "@/infrastructure/email/transport";
import { asPrisma, createPrismaMock } from "../../helpers/mock-prisma";

describe("InviteService", () => {
  beforeEach(() => {
    __setEmailTransportForTests(null);
  });

  describe("generateInviteToken", () => {
    it("returns a url-safe high-entropy token", () => {
      const a = generateInviteToken();
      const b = generateInviteToken();
      expect(a).not.toEqual(b);
      expect(a.length).toBeGreaterThanOrEqual(24);
      expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe("create", () => {
    it("persists an invite, audit event, and sends an email", async () => {
      const transport = new InMemoryEmailTransport();
      const db = createPrismaMock();
      db.business.findUnique.mockResolvedValue({ id: "b1", name: "Cafe Test" });
      db.user.findUnique.mockResolvedValue({ id: "u1", name: "Owner" });
      db.invite.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        id: "inv1",
        expiresAt: args.data.expiresAt,
        token: args.data.token,
        ...args.data,
      }));
      db.auditEvent.create.mockResolvedValue({});

      const svc = new InviteService(asPrisma(db), new EmailService(transport));
      const result = await svc.create({
        businessId: "b1",
        invitedById: "u1",
        email: "hire@example.com",
      });

      expect(result.id).toBe("inv1");
      expect(db.invite.create).toHaveBeenCalled();
      expect(db.auditEvent.create).toHaveBeenCalled();
      expect(transport.messages()).toHaveLength(1);
      expect(transport.messages()[0]!.to).toBe("hire@example.com");
    });

    it("throws when business is missing", async () => {
      const db = createPrismaMock();
      db.business.findUnique.mockResolvedValue(null);
      db.user.findUnique.mockResolvedValue({ id: "u1" });
      const svc = new InviteService(asPrisma(db));
      await expect(
        svc.create({ businessId: "missing", invitedById: "u1" }),
      ).rejects.toThrow(/business not found/i);
    });
  });

  describe("accept", () => {
    it("rejects an expired invite", async () => {
      const db = createPrismaMock();
      db.invite.findUnique.mockResolvedValue({
        id: "inv1",
        token: "t",
        email: "x@y.com",
        expiresAt: new Date(Date.now() - 1000),
        acceptedAt: null,
        role: "WORKER",
        businessId: "b1",
        business: { id: "b1", name: "X" },
      });
      const svc = new InviteService(asPrisma(db));
      await expect(
        svc.accept({ token: "t", name: "Test", password: "longpassword" }),
      ).rejects.toThrow(/expired/i);
    });

    it("rejects an already-accepted invite", async () => {
      const db = createPrismaMock();
      db.invite.findUnique.mockResolvedValue({
        id: "inv1",
        token: "t",
        email: "x@y.com",
        expiresAt: new Date(Date.now() + 100000),
        acceptedAt: new Date(),
        role: "WORKER",
        businessId: "b1",
        business: { id: "b1", name: "X" },
      });
      const svc = new InviteService(asPrisma(db));
      await expect(
        svc.accept({ token: "t", name: "Test", password: "longpassword" }),
      ).rejects.toThrow(/already accepted/i);
    });
  });
});
