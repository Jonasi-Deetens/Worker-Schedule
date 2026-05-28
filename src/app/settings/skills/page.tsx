import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { SkillsClient } from "./skills-client";

export const metadata = {
  title: "Skills — Tattoogenda",
};

export default async function SkillsSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER" && session.user.role !== "MANAGER") {
    redirect("/calendar");
  }
  return <SkillsClient />;
}
