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
      const businessName = input.businessName;
      if (!businessName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Business name is required for owners",
        });
      }

      // Create user, business, owner backlink and the OWNER membership as one
      // atomic unit so we never end up with a business that has no membership.
      return this.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            name: input.name,
            role: "OWNER",
          },
        });

        const business = await tx.business.create({
          data: {
            name: businessName,
            ownerId: user.id,
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: { businessId: business.id },
        });

        await tx.membership.create({
          data: {
            userId: user.id,
            businessId: business.id,
            role: "OWNER",
            status: "ACTIVE",
          },
        });

        return { userId: user.id, businessId: business.id };
      });
    }

    const businessId = input.businessId;
    if (!businessId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Business ID is required for workers",
      });
    }

    const business = await this.db.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Business not found",
      });
    }

    // Self-serve worker signups also get a membership so business-scoped
    // authorization (active-membership checks) treats them like invited staff.
    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          role: "WORKER",
          businessId,
        },
      });

      await tx.membership.create({
        data: {
          userId: created.id,
          businessId,
          role: "WORKER",
          status: "ACTIVE",
        },
      });

      return created;
    });

    return { userId: user.id, businessId };
  }
}
