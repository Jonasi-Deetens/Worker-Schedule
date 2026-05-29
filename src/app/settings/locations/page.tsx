import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { LocationsClient } from "./locations-client";

export const metadata = {
  title: "Locations — Work Calendar",
};

export default async function LocationsSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER" && session.user.role !== "MANAGER") {
    redirect("/calendar");
  }
  return <LocationsClient />;
}
