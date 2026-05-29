import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { logger } from "@/infrastructure/logging/logger";
import { EmailService } from "./email-service";

/** Reset links are valid for one hour. */
const DEFAULT_EXPIRY_MS = 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Email-token password reset. The raw token only ever lives in the emailed
 * link; the database stores its SHA-256 hash, so a DB leak cannot be replayed.
 *
 * `requestReset` is deliberately enumeration-safe: it returns the same success
 * shape whether or not the email maps to an active account, and only does work
 * (token + email) for ACTIVE users.
 */
export class PasswordResetService {
  constructor(
    private readonly db: PrismaClient,
    private readonly emails: EmailService = new EmailService(),
    private readonly appUrl: string = process.env.NEXTAUTH_URL ??
      "http://localhost:3000",
    private readonly now: () => Date = () => new Date(),
  ) {}

  async requestReset(email: string): Promise<{ success: true }> {
    const user = await this.db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user && user.status === "ACTIVE") {
      const token = generateResetToken();
      const expiresAt = new Date(this.now().getTime() + DEFAULT_EXPIRY_MS);
      await this.db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt,
        },
      });
      await this.emails.sendPasswordReset(
        { email: user.email },
        {
          recipientName: user.name,
          resetUrl: this.buildResetUrl(token),
          expiresAt,
        },
      );
      logger.info({ event: "passwordReset.requested", userId: user.id });
    } else {
      logger.info({ event: "passwordReset.requestedUnknown" });
    }

    // Always the same response — never reveal whether the email is registered.
    return { success: true };
  }

  async resetPassword(input: {
    token: string;
    newPassword: string;
  }): Promise<{ success: true }> {
    if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error("errors.weakPassword");
    }

    const tokenHash = hashResetToken(input.token);
    const record = await this.db.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expiresAt < this.now()) {
      throw new Error("errors.resetTokenInvalid");
    }

    const passwordHash = await hash(input.newPassword, 12);

    // Update the password and burn the token atomically. Also invalidate any
    // other outstanding reset tokens for this user so a leaked older link can't
    // be used after a successful reset.
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: this.now() },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: this.now() },
      });
    });

    logger.info({ event: "passwordReset.completed", userId: record.userId });
    return { success: true };
  }

  private buildResetUrl(token: string): string {
    return `${this.appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  }
}
