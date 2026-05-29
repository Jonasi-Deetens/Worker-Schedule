import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { ClockClient } from "./clock-client";

export const metadata = {
  title: "Time clock — Work Calendar",
};

export default async function ClockPage({
  searchParams,
}: {
  searchParams: Promise<{ shiftId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { shiftId } = await searchParams;
  return <ClockClient initialShiftId={shiftId ?? null} />;
}
