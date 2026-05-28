import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { HoursClient } from "./hours-client";

export const metadata = {
  title: "My hours — Work Calendar",
};

export default async function HoursPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <HoursClient />;
}
