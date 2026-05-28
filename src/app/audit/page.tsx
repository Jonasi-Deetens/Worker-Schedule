import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { AuditViewer } from "./audit-viewer";

export const metadata = {
  title: "Audit log — Tattoogenda",
};

export default async function AuditPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER" || !session.user.businessId) {
    redirect("/calendar");
  }
  return <AuditViewer />;
}
