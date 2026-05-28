import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { WorkerDetailClient } from "./worker-detail-client";

export const metadata = {
  title: "Worker — Tattoogenda",
};

export default async function WorkerDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER" && session.user.role !== "MANAGER") {
    redirect("/calendar");
  }

  const { id } = await props.params;
  return <WorkerDetailClient workerId={id} />;
}
