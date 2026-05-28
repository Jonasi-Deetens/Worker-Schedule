import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { TemplatesClient } from "./templates-client";

export const metadata = {
  title: "Shift templates — Work Calendar",
};

export default async function TemplatesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/calendar");

  return <TemplatesClient />;
}
