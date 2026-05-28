import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { TimeOffClient } from "./timeoff-client";

export const metadata = {
  title: "Time off — Tattoogenda",
};

export default async function TimeOffPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <TimeOffClient role={session.user.role} />;
}
