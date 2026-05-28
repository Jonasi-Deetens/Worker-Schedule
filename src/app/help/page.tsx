import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/auth-options";
import { AppHeader } from "@/interface/components/app-header";
import { HelpClient } from "./help-client";

/**
 * In-app help / documentation. Available to every signed-in user; the
 * client component renders sections relevant to the user's role first.
 */
export default async function HelpPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <HelpClient role={session.user.role} />
    </div>
  );
}
