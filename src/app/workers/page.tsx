import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { WorkersClient } from "./workers-client";

export const metadata = {
  title: "Team — Tattoogenda",
};

export default async function WorkersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (
    session.user.role !== "OWNER" &&
    session.user.role !== "MANAGER"
  ) {
    redirect("/calendar");
  }
  if (!session.user.businessId) redirect("/calendar");

  return <WorkersClient />;
}
