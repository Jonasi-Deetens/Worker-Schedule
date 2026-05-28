import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import type { PrismaClient, UserRole } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";
import { EmailService } from "./email-service";

const DEFAULT_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export class InviteService {
  constructor(
    private readonly db: PrismaClient,
    private readonly emails: EmailService = new EmailService(),
    private readonly appUrl: string = process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  ) {}

  async create(input: {
    businessId: string;
    invitedById: string;
    email?: string;
    role?: UserRole;
    expiresInMs?: number;
  }) {
    const business = await this.db.business.findUnique({
      where: { id: input.businessId },
    });
    if (!business) throw new Error("Business not found");

    const inviter = await this.db.user.findUnique({
      where: { id: input.invitedById },
    });
    if (!inviter) throw new Error("Inviter not found");

    const token = generateInviteToken();
    const expiresAt = new Date(
      Date.now() + (input.expiresInMs ?? DEFAULT_EXPIRY_MS),
    );

    const invite = await this.db.invite.create({
      data: {
        businessId: input.businessId,
        invitedById: input.invitedById,
        email: input.email ?? null,
        role: input.role ?? "WORKER",
        token,
        expiresAt,
      },
    });

    await this.db.auditEvent.create({
      data: {
        userId: input.invitedById,
        action: "INVITE_SENT",
        entityType: "Invite",
        entityId: invite.id,
        metadata: { email: input.email },
      },
    });

    if (input.email) {
      await this.emails.sendInvite(
        { email: input.email, name: input.email.split("@")[0] ?? "there" },
        {
          recipientName: input.email.split("@")[0] ?? "there",
          businessName: business.name,
          inviteUrl: this.buildAcceptUrl(token),
          expiresAt,
        },
      );
    }

    logger.info({
      event: "invite.created",
      inviteId: invite.id,
      businessId: input.businessId,
    });

    return { ...invite, acceptUrl: this.buildAcceptUrl(token) };
  }

  async findByToken(token: string) {
    const invite = await this.db.invite.findUnique({
      where: { token },
      include: { business: { select: { id: true, name: true } } },
    });
    if (!invite) return null;
    return invite;
  }

  async accept(input: {
    token: string;
    name: string;
    password: string;
  }) {
    const invite = await this.db.invite.findUnique({
      where: { token: input.token },
      include: { business: true },
    });
    if (!invite) throw new Error("Invite not found");
    if (invite.acceptedAt) throw new Error("Invite already accepted");
    if (invite.expiresAt < new Date()) throw new Error("Invite expired");

    const passwordHash = await hash(input.password, 12);
    const userEmail = invite.email;

    if (!userEmail) throw new Error("Invite email missing");

    const existing = await this.db.user.findUnique({
      where: { email: userEmail },
    });
    if (existing) {
      throw new Error("Email already registered");
    }

    const user = await this.db.user.create({
      data: {
        email: userEmail,
        passwordHash,
        name: input.name,
        role: invite.role,
        businessId: invite.businessId,
      },
    });

    await this.db.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    await this.db.auditEvent.create({
      data: {
        userId: user.id,
        action: "INVITE_ACCEPTED",
        entityType: "Invite",
        entityId: invite.id,
      },
    });

    await this.db.notification.create({
      data: {
        userId: invite.invitedById,
        type: "INVITE_ACCEPTED",
        title: "Invite accepted",
        body: `${user.name} joined ${invite.business.name}.`,
        payload: { userId: user.id },
      },
    });

    return { user, businessId: invite.businessId };
  }

  async listForBusiness(businessId: string) {
    return this.db.invite.findMany({
      where: { businessId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async revoke(input: { id: string; businessId: string }) {
    const invite = await this.db.invite.findFirst({
      where: { id: input.id, businessId: input.businessId },
    });
    if (!invite) throw new Error("Invite not found");
    await this.db.invite.delete({ where: { id: invite.id } });
  }

  private buildAcceptUrl(token: string): string {
    return `${this.appUrl.replace(/\/$/, "")}/invite/${token}`;
  }
}
