import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  generateSecret,
  totpAuthUrl,
  verifyTotp,
} from "@/infrastructure/auth/totp";

/**
 * Thin wrapper that pairs the pure RFC 6238 helpers in
 * `infrastructure/auth/totp.ts` with the user-row write-side. The pure
 * helpers stay independently testable; the only DB knowledge lives here.
 */
export class TotpAccountService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Generate a fresh secret and otpauth URL for the QR-code render. The
   * secret is *not* persisted until the user confirms it through `enable`
   * with a matching 6-digit code, so an abandoned setup leaves no state.
   */
  setup(account: string): { secret: string; otpauthUrl: string } {
    const secret = generateSecret();
    const otpauthUrl = totpAuthUrl({
      account,
      issuer: "Work Calendar",
      secret,
    });
    return { secret, otpauthUrl };
  }

  async enable(input: {
    userId: string;
    secret: string;
    token: string;
  }): Promise<{ success: true }> {
    if (!verifyTotp(input.secret, input.token)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid code" });
    }
    await this.db.user.update({
      where: { id: input.userId },
      data: { twoFactorSecret: input.secret },
    });
    return { success: true };
  }

  async disable(userId: string): Promise<{ success: true }> {
    await this.db.user.update({
      where: { id: userId },
      data: { twoFactorSecret: null },
    });
    return { success: true };
  }
}
