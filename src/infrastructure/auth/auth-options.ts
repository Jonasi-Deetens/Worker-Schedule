import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import type { PrismaClient } from "@prisma/client";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/prisma";
import { verifyTotp } from "@/infrastructure/auth/totp";
import type { UserRole } from "@/domain/types";

type Provider = NextAuthOptions["providers"][number];

/**
 * Stable, machine-readable error messages thrown by {@link authorizeCredentials}.
 * The login page maps these to localized copy; keeping them as constants means
 * the UI and the tests reference the same source of truth.
 */
export const AUTH_ERROR = {
  ACCOUNT_NOT_ACTIVE: "ACCOUNT_NOT_ACTIVE",
  TOTP_REQUIRED: "TOTP_REQUIRED",
  TOTP_INVALID: "TOTP_INVALID",
} as const;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().optional(),
});

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  businessId: string | null;
}

/**
 * Pure credentials-authorization logic, extracted from the provider so it can
 * be unit-tested without spinning up NextAuth.
 *
 * - Returns `null` for unknown email / bad password (NextAuth maps this to the
 *   generic `CredentialsSignin` error so we don't leak which part was wrong).
 * - Throws a stable {@link AUTH_ERROR} code for SUSPENDED/ARCHIVED accounts and
 *   for missing/invalid TOTP when the user has 2FA enabled — these are real,
 *   actionable failures the UI surfaces verbatim.
 */
export async function authorizeCredentials(
  credentials: Record<string, unknown> | undefined,
  db: PrismaClient = prisma,
): Promise<AuthorizedUser | null> {
  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user) {
    return null;
  }

  const valid = await compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return null;
  }

  if (user.status !== "ACTIVE") {
    throw new Error(AUTH_ERROR.ACCOUNT_NOT_ACTIVE);
  }

  // Enforce TOTP at login for any account that has completed 2FA setup.
  if (user.twoFactorSecret) {
    if (!parsed.data.totp) {
      throw new Error(AUTH_ERROR.TOTP_REQUIRED);
    }
    if (!verifyTotp(user.twoFactorSecret, parsed.data.totp)) {
      throw new Error(AUTH_ERROR.TOTP_INVALID);
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    businessId: user.businessId,
  };
}

function buildProviders(): Provider[] {
  const providers: Provider[] = [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authentication code", type: "text" },
      },
      authorize(credentials) {
        return authorizeCredentials(credentials);
      },
    }),
  ];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    );
  }

  return providers;
}

const useSecureCookies = process.env.NODE_ENV === "production";
// In production cookies are prefixed with `__Secure-` and marked Secure; in
// local http dev we drop both so the session cookie is still accepted.
const sessionCookieName = useSecureCookies
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  // Only force Secure cookies in production so http://localhost keeps working.
  useSecureCookies,
  cookies: {
    sessionToken: {
      name: sessionCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  providers: buildProviders(),
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
        });
        if (!existing) {
          return false;
        }
        (user as { role?: UserRole }).role = existing.role as UserRole;
        (user as { businessId?: string | null }).businessId = existing.businessId;
        (user as { id?: string }).id = existing.id;
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: UserRole }).role;
        token.businessId = (user as { businessId: string | null }).businessId;
      }

      // Business switching: the client calls `session.update({ businessId })`
      // after validating the target membership via `membership.switch`. We
      // re-check the active membership here (the JWT is the source of truth, so
      // the client cannot just assert a businessId) and adopt that membership's
      // role — roles are stored per-business on `Membership`.
      if (trigger === "update" && session && typeof token.id === "string") {
        const requestedBusinessId = (session as { businessId?: unknown })
          .businessId;
        if (typeof requestedBusinessId === "string") {
          const membership = await prisma.membership.findFirst({
            where: {
              userId: token.id,
              businessId: requestedBusinessId,
              status: "ACTIVE",
            },
          });
          if (membership) {
            token.businessId = membership.businessId;
            token.role = membership.role as UserRole;
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.businessId = (token.businessId as string | null) ?? null;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
