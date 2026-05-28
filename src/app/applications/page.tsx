import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { ApplicationsPageClient } from "./applications-client";

export const metadata = {
  title: "My applications — Tattoogenda",
};

export default async function ApplicationsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== "WORKER") {
    redirect("/calendar");
  }

  return <ApplicationsPageClient />;
}
