import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { AppHeader } from "@/interface/components/app-header";
import { InsightsClient } from "./insights-client";

export default async function InsightsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== "OWNER" && session.user.role !== "MANAGER") {
    redirect("/calendar");
  }
  return (
    <div className="min-h-screen bg-app">
      <AppHeader />
      <InsightsClient />
    </div>
  );
}
