import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { CalendarPageClient } from "./calendar-client";

export default async function CalendarPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  return (
    <CalendarPageClient
      role={session.user.role}
      userName={session.user.name ?? ""}
    />
  );
}
