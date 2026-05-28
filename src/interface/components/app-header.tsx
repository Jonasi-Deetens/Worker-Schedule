"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  CalendarClock,
  ClipboardList,
  Clock,
  HelpCircle,
  Home,
  LogOut,
  ShieldCheck,
  Tags,
  UserCircle,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";

export function AppHeader() {
  const { data: session } = useSession();
  const t = useTranslations();
  const { data: unread } = trpc.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const { data: memberships } = trpc.membership.listMine.useQuery(undefined, {
    enabled: Boolean(session?.user),
  });

  if (!session?.user) return null;
  const role = session.user.role;
  const isOwner = role === "OWNER";
  const isManager = role === "MANAGER";
  const isOwnerOrManager = isOwner || isManager;
  const hasMultipleBusinesses = (memberships?.length ?? 0) > 1;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href={isOwnerOrManager ? "/calendar" : "/me"}
            className="text-lg font-semibold text-slate-900"
          >
            Tattoogenda
          </Link>
          <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 sm:inline">
            {role === "OWNER"
              ? t("auth.owner")
              : role === "MANAGER"
                ? t("auth.manager")
                : t("auth.worker")}
          </span>
          {hasMultipleBusinesses && memberships && (
            <BusinessSwitcher
              memberships={memberships}
              currentBusinessId={session.user.businessId ?? null}
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isOwnerOrManager && (
            <NavLink href="/me" label={t("me.greeting")}>
              <Home className="h-5 w-5" />
            </NavLink>
          )}
          {isOwnerOrManager && (
            <NavLink href="/workers" label={t("workers.title")}>
              <Users className="h-5 w-5" />
            </NavLink>
          )}
          {!isOwner && (
            <NavLink href="/applications" label={t("applications.title")}>
              <ClipboardList className="h-5 w-5" />
            </NavLink>
          )}
          <NavLink href="/timeoff" label={t("timeOff.title")}>
            <CalendarClock className="h-5 w-5" />
          </NavLink>
          <NavLink href="/clock" label={t("clock.title")}>
            <Clock className="h-5 w-5" />
          </NavLink>
          {isOwnerOrManager && (
            <NavLink href="/settings/skills" label={t("skills.title")}>
              <Tags className="h-5 w-5" />
            </NavLink>
          )}
          {isOwnerOrManager && (
            <NavLink href="/insights" label={t("insights.title")}>
              <BarChart3 className="h-5 w-5" />
            </NavLink>
          )}
          {isOwner && (
            <NavLink href="/settings/developers" label="Developers">
              <span className="text-xs font-semibold">{"</>"}</span>
            </NavLink>
          )}
          {isOwner && (
            <NavLink href="/audit" label="Audit log">
              <ShieldCheck className="h-5 w-5" />
            </NavLink>
          )}
          <NavLink href="/help" label={t("help.title")}>
            <HelpCircle className="h-5 w-5" />
          </NavLink>
          <NavLink href="/settings/profile" label={t("profile.title")}>
            <UserCircle className="h-5 w-5" />
          </NavLink>
          <Link
            href="/notifications"
            className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label={t("notifications.unreadAria", {
              count: unread?.count ?? 0,
            })}
          >
            <Bell className="h-5 w-5" />
            {unread && unread.count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread.count > 9 ? "9+" : unread.count}
              </span>
            )}
          </Link>
          <span className="hidden text-sm text-slate-600 sm:inline">
            {session.user.name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label={t("auth.signOut")}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:inline-flex"
      aria-label={label}
      title={label}
    >
      {children}
    </Link>
  );
}

function BusinessSwitcher({
  memberships,
  currentBusinessId,
}: {
  memberships: { businessId: string; businessName: string }[];
  currentBusinessId: string | null;
}) {
  return (
    <select
      aria-label="Switch business"
      value={currentBusinessId ?? undefined}
      onChange={() => {
        // Switching businesses currently requires a re-login because the
        // session.businessId is fixed at sign-in time. We leave the control in
        // place so users see their other memberships and can act on them once
        // server-side switching ships.
        window.location.assign("/login?reason=switch");
      }}
      className="hidden rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 sm:inline-flex"
    >
      {memberships.map((m) => (
        <option key={m.businessId} value={m.businessId}>
          {m.businessName}
        </option>
      ))}
    </select>
  );
}
