import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/auth-options";
import type { TRPCContext } from "./init";

export async function createTRPCContext(): Promise<TRPCContext> {
  const session = await getServerSession(authOptions);
  return { session: session as TRPCContext["session"] };
}
