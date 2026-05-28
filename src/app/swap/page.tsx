import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { SwapClient } from "./swap-client";

export const metadata = {
  title: "Shift swaps — Tattoogenda",
};

export default async function SwapPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <SwapClient />;
}
