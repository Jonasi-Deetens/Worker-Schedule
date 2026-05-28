import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { AppHeader } from "@/interface/components/app-header";
import { MeHomeClient } from "./me-home-client";

export default async function MyHomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <MeHomeClient />
    </div>
  );
}
