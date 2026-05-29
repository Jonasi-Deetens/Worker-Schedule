import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { AppHeader } from "@/interface/components/app-header";
import { DevelopersClient } from "./developers-client";

export default async function DevelopersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/calendar");
  return (
    <div className="min-h-screen bg-app">
      <AppHeader />
      <DevelopersClient />
    </div>
  );
}
