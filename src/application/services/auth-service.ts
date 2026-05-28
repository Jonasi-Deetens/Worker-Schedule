import type { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { TRPCError } from "@trpc/server";

/**
 * Owns the self-serve registration flow. Owner registrations create a
 * brand-new user + business + owner backlink in a single logical operation;
 * worker registrations only succeed when the supplied business already
 * exists. We throw TRPCError directly (rather than a service-level Error)
 * because every caller is a tRPC procedure and the codes (`CONFLICT`,
 * `BAD_REQUEST`, `NOT_FOUND`) carry meaning the UI relies on.
 */
export class AuthService {
  constructor(private readonly db: PrismaClient) {}

  async register(input: {
    email: string;
    password: string;
    name: string;
    role: "OWNER" | "WORKER";
    businessName?: string;
    businessId?: string;
  }): Promise<{ userId: string; businessId: string }> {
    const existing = await this.db.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Email already registered",
      });
    }

    const passwordHash = await hash(input.password, 12);

    if (input.role === "OWNER") {
      if (!input.businessName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Business name is required for owners",
        });
      }

      const user = await this.db.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          role: "OWNER",
        },
      });

      const business = await this.db.business.create({
        data: {
          name: input.businessName,
          ownerId: user.id,
        },
      });

      await this.db.user.update({
        where: { id: user.id },
        data: { businessId: business.id },
      });

      return { userId: user.id, businessId: business.id };
    }

    if (!input.businessId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Business ID is required for workers",
      });
    }

    const business = await this.db.business.findUnique({
      where: { id: input.businessId },
    });
    if (!business) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Business not found",
      });
    }

    const user = await this.db.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        role: "WORKER",
        businessId: input.businessId,
      },
    });

    return { userId: user.id, businessId: input.businessId };
  }
}
