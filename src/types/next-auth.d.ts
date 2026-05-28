import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/domain/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      businessId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    businessId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    businessId: string | null;
  }
}

export {};
