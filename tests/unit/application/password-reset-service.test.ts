import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hashResetToken,
  PasswordResetService,
} from "@/application/services/password-reset-service";
import type { EmailService } from "@/application/services/email-service";
import { asPrisma, createPrismaMock, type PrismaMock } from "../../helpers/mock-prisma";

let prisma: PrismaMock;
let sendPasswordReset: ReturnType<typeof vi.fn>;
let emails: EmailService;
let service: PasswordResetService;
const NOW = new Date("2026-05-29T12:00:00Z");

beforeEach(() => {
  prisma = createPrismaMock();
  sendPasswordReset = vi.fn().mockResolvedValue(undefined);
  emails = { sendPasswordReset } as unknown as EmailService;
  service = new PasswordResetService(
    asPrisma(prisma),
    emails,
    "https://app.test",
    () => NOW,
  );
});

describe("PasswordResetService.requestReset", () => {
  it("creates a hashed token and emails an active user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.io",
      name: "Ann",
      status: "ACTIVE",
    });
    prisma.passwordResetToken.create.mockResolvedValue({ id: "t1" });

    const result = await service.requestReset("A@B.io");

    expect(result).toEqual({ success: true });
    const created = prisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(created.userId).toBe("u1");
    // The raw token is never stored — only its sha256 hash (64 hex chars).
    expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  it("is enumeration-safe for unknown emails (no token, no email, still success)", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await service.requestReset("nobody@b.io");
    expect(result).toEqual({ success: true });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it("does nothing for inactive accounts but still returns success", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u2",
      email: "s@b.io",
      name: "Sus",
      status: "SUSPENDED",
    });
    const result = await service.requestReset("s@b.io");
    expect(result).toEqual({ success: true });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });
});

describe("PasswordResetService.resetPassword", () => {
  it("sets a new password and burns the token for a valid request", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      usedAt: null,
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    prisma.user.update.mockResolvedValue({ id: "u1" });
    prisma.passwordResetToken.update.mockResolvedValue({ id: "t1" });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.resetPassword({
      token: "raw-token",
      newPassword: "brand-new-pass",
    });

    expect(result).toEqual({ success: true });
    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashResetToken("raw-token") },
    });
    // bcrypt hash, not the raw password.
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1" } }),
    );
  });

  it("rejects an expired token", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      usedAt: null,
      expiresAt: new Date(NOW.getTime() - 1000),
    });
    await expect(
      service.resetPassword({ token: "x", newPassword: "longenough" }),
    ).rejects.toThrow("errors.resetTokenInvalid");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an already-used token", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      usedAt: new Date(NOW.getTime() - 1000),
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    await expect(
      service.resetPassword({ token: "x", newPassword: "longenough" }),
    ).rejects.toThrow("errors.resetTokenInvalid");
  });

  it("rejects an unknown token", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);
    await expect(
      service.resetPassword({ token: "x", newPassword: "longenough" }),
    ).rejects.toThrow("errors.resetTokenInvalid");
  });

  it("rejects a weak password before touching the token", async () => {
    await expect(
      service.resetPassword({ token: "x", newPassword: "short" }),
    ).rejects.toThrow("errors.weakPassword");
    expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });
});
