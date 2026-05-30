import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { AppHeader } from "@/interface/components/app-header";
import { ContractsInboxClient } from "./contracts-inbox-client";

export default async function ContractsInboxPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  if (role !== "OWNER" && role !== "MANAGER") redirect("/me");
  return (
    <div className="min-h-screen bg-app">
      <AppHeader />
      <ContractsInboxClient />
    </div>
  );
}
