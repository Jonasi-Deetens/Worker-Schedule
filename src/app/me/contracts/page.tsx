import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { AppHeader } from "@/interface/components/app-header";
import { MeContractsClient } from "./me-contracts-client";

export default async function MeContractsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role === "OWNER") redirect("/workers");
  return (
    <div className="min-h-screen bg-app">
      <AppHeader />
      <MeContractsClient />
    </div>
  );
}
