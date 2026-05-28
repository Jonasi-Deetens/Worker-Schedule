import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { ProfileClient } from "./profile-client";

export const metadata = {
  title: "Profile — Tattoogenda",
};

export default async function ProfileSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <ProfileClient />;
}
