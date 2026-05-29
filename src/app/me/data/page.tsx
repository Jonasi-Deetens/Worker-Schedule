import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { AppHeader } from "@/interface/components/app-header";
import { MyDataClient } from "./my-data-client";

export default async function MyDataPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <div className="min-h-screen bg-app">
      <AppHeader />
      <MyDataClient />
    </div>
  );
}
