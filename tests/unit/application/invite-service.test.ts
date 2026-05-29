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

    it("creates the user and an ACTIVE membership with the invited role", async () => {
      const db = createPrismaMock();
      db.invite.findUnique.mockResolvedValue({
        id: "inv1",
        token: "t",
        email: "hire@x.com",
        expiresAt: new Date(Date.now() + 100000),
        acceptedAt: null,
        role: "MANAGER",
        businessId: "b1",
        invitedById: "owner1",
        business: { id: "b1", name: "Cafe" },
      });
      db.user.findUnique.mockResolvedValue(null);
      db.user.create.mockResolvedValue({
        id: "u-new",
        name: "Hire",
        email: "hire@x.com",
      });

      const svc = new InviteService(asPrisma(db));
      const result = await svc.accept({
        token: "t",
        name: "Hire",
        password: "longpassword",
      });

      expect(result.businessId).toBe("b1");
      expect(db.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: "hire@x.com", role: "MANAGER" }),
        }),
      );
      expect(db.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "u-new",
            businessId: "b1",
            role: "MANAGER",
            status: "ACTIVE",
          }),
        }),
      );
      expect(db.invite.update).toHaveBeenCalled();
    });

    it("accepts a link-only (null-email) invite using the supplied email", async () => {
      const db = createPrismaMock();
      db.invite.findUnique.mockResolvedValue({
        id: "inv2",
        token: "t2",
        email: null,
        expiresAt: new Date(Date.now() + 100000),
        acceptedAt: null,
        role: "WORKER",
        businessId: "b1",
        invitedById: "owner1",
        business: { id: "b1", name: "Cafe" },
      });
      db.user.findUnique.mockResolvedValue(null);
      db.user.create.mockResolvedValue({
        id: "u-self",
        name: "Self",
        email: "self@x.com",
      });

      const svc = new InviteService(asPrisma(db));
      const result = await svc.accept({
        token: "t2",
        name: "Self",
        password: "longpassword",
        email: "self@x.com",
      });

      expect(result.user.email).toBe("self@x.com");
      expect(db.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: "self@x.com" }),
        }),
      );
      expect(db.membership.create).toHaveBeenCalled();
    });

    it("rejects a null-email invite when no email is supplied", async () => {
      const db = createPrismaMock();
      db.invite.findUnique.mockResolvedValue({
        id: "inv3",
        token: "t3",
        email: null,
        expiresAt: new Date(Date.now() + 100000),
        acceptedAt: null,
        role: "WORKER",
        businessId: "b1",
        invitedById: "owner1",
        business: { id: "b1", name: "Cafe" },
      });
      const svc = new InviteService(asPrisma(db));
      await expect(
        svc.accept({ token: "t3", name: "Self", password: "longpassword" }),
      ).rejects.toThrow(/email is required/i);
    });
  });
});
