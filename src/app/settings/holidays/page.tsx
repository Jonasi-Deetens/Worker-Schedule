import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { HolidaysClient } from "./holidays-client";

export const metadata = {
  title: "Holidays — Work Calendar",
};

export default async function HolidaysSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER" && session.user.role !== "MANAGER") {
    redirect("/calendar");
  }
  return <HolidaysClient />;
}
