import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { ClockClient } from "./clock-client";

export const metadata = {
  title: "Time clock — Tattoogenda",
};

export default async function ClockPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <ClockClient />;
}
