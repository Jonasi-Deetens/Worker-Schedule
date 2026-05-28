import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { TimeEntriesClient } from "./time-entries-client";

export const metadata = {
  title: "Time entries — Work Calendar",
};

export default async function TimeEntriesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER" && session.user.role !== "MANAGER") {
    redirect("/calendar");
  }
  return <TimeEntriesClient />;
}
