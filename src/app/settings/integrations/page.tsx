import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { IntegrationsClient } from "./integrations-client";

export const metadata = {
  title: "Integrations — Work Calendar",
};

export default async function IntegrationsSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  // Credentials are owner-only — managers can run declarations but not set keys.
  if (session.user.role !== "OWNER") {
    redirect("/calendar");
  }
  return <IntegrationsClient />;
}
