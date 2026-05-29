import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { AvailabilityTemplatesClient } from "./availability-client";

export const metadata = {
  title: "Recurring availability — Work Calendar",
};

export default async function AvailabilityTemplatesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  // Availability templates are a personal worker tool; owners and managers
  // plan from the calendar instead. Mirrors the workerProcedure gating on the
  // availabilityTemplate router.
  if (session.user.role !== "WORKER") {
    redirect("/calendar");
  }
  return <AvailabilityTemplatesClient />;
}
