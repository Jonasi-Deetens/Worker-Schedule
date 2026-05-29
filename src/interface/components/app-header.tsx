"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Clock,
  HelpCircle,
  Home,
  LayoutTemplate,
  LogOut,
  MapPin,
  Menu,
  Plug,
  Settings,
  ShieldCheck,
  Tags,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

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

  // Primary navigation: rendered as direct icons on desktop and as rows in the
  // mobile drawer. Each entry is already filtered by the current user's role.
  const primaryItems: NavItem[] = [
    isOwnerOrManager
      ? {
          href: "/workers",
          label: t("workers.title"),
          icon: <Users className="h-5 w-5" />,
        }
      : {
          href: "/me",
          label: t("me.greeting"),
          icon: <Home className="h-5 w-5" />,
        },
    ...(!isOwner
      ? [
          {
            href: "/applications",
            label: t("applications.title"),
            icon: <ClipboardList className="h-5 w-5" />,
          },
        ]
      : []),
    {
      href: "/timeoff",
      label: t("timeOff.title"),
      icon: <CalendarClock className="h-5 w-5" />,
    },
    ...(!isOwner
      ? [
          {
            href: "/clock",
            label: t("clock.title"),
            icon: <Clock className="h-5 w-5" />,
          },
        ]
      : []),
    ...(isOwnerOrManager
      ? [
          {
            href: "/payroll/time-entries",
            label: t("payroll.title"),
            icon: <ClipboardCheck className="h-5 w-5" />,
          },
          {
            href: "/insights",
            label: t("insights.title"),
            icon: <BarChart3 className="h-5 w-5" />,
          },
        ]
      : []),
    {
      href: "/help",
      label: t("help.title"),
      icon: <HelpCircle className="h-5 w-5" />,
    },
    {
      href: "/settings/profile",
      label: t("profile.title"),
      icon: <UserCircle className="h-5 w-5" />,
    },
  ];

  // Setup/admin links grouped into the desktop "Settings" dropdown and the
  // mobile drawer's settings section.
  const settingsItems: NavItem[] = [
    ...(!isOwnerOrManager
      ? [
          {
            href: "/settings/availability",
            label: t("availabilityTemplates.title"),
            icon: <CalendarRange className="h-5 w-5" />,
          },
        ]
      : []),
    ...(isOwnerOrManager
      ? [
          {
            href: "/settings/skills",
            label: t("skills.title"),
            icon: <Tags className="h-5 w-5" />,
          },
          {
            href: "/settings/rosters",
            label: t("rosters.title"),
            icon: <CalendarRange className="h-5 w-5" />,
          },
          {
            href: "/settings/locations",
            label: t("locations.title"),
            icon: <MapPin className="h-5 w-5" />,
          },
        ]
      : []),
    ...(isOwner
      ? [
          {
            href: "/settings/templates",
            label: t("templates.title"),
            icon: <LayoutTemplate className="h-5 w-5" />,
          },
          {
            href: "/settings/integrations",
            label: t("integrations.title"),
            icon: <Plug className="h-5 w-5" />,
          },
          {
            href: "/settings/developers",
            label: "Developers",
            icon: <span className="text-xs font-semibold">{"</>"}</span>,
          },
          {
            href: "/audit",
            label: "Audit log",
            icon: <ShieldCheck className="h-5 w-5" />,
          },
        ]
      : []),
  ];

  const unreadCount = unread?.count ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={isOwnerOrManager ? "/calendar" : "/me"}
            className="truncate text-lg font-semibold tracking-tight text-ink"
          >
            Work Calendar
          </Link>
          <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-ink-muted sm:inline">
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

        {/* Desktop navigation */}
        <div className="hidden items-center gap-1 md:flex">
          {primaryItems.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label}>
              {item.icon}
            </NavLink>
          ))}
          {settingsItems.length > 0 && (
            <SettingsMenu items={settingsItems} label={t("nav.settings")} />
          )}
          <NavLink
            href="/notifications"
            label={t("notifications.unreadAria", { count: unreadCount })}
          >
            <span className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
          </NavLink>
          <span className="hidden max-w-40 truncate text-sm text-ink-muted lg:inline">
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

        {/* Mobile navigation */}
        <div className="flex items-center gap-1 md:hidden">
          <MobileDrawer
            primaryItems={primaryItems}
            settingsItems={settingsItems}
            settingsLabel={t("nav.settings")}
            menuLabel={t("nav.menu")}
            closeLabel={t("nav.close")}
            notificationsLabel={t("notifications.unreadAria", {
              count: unreadCount,
            })}
            notificationsTitle={t("notifications.title")}
            unreadCount={unreadCount}
            signOutLabel={t("auth.signOut")}
            onSignOut={() => signOut({ callbackUrl: "/login" })}
            memberships={hasMultipleBusinesses ? (memberships ?? []) : []}
            currentBusinessId={session.user.businessId ?? null}
          />
        </div>
      </div>
    </header>
  );
}

function useIsActive(href: string) {
  const pathname = usePathname();
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
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
  const active = useIsActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex rounded-xl p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "text-ink-muted hover:bg-slate-100 hover:text-ink"
      }`}
      aria-label={label}
      title={label}
    >
      {children}
    </Link>
  );
}

function SettingsMenu({ items, label }: { items: NavItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const sectionActive = items.some(
    (item) =>
      pathname === item.href || (pathname?.startsWith(`${item.href}/`) ?? false),
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex rounded-xl p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          sectionActive || open
            ? "bg-emerald-50 text-emerald-700"
            : "text-ink-muted hover:bg-slate-100 hover:text-ink"
        }`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Settings className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-hairline bg-white p-1.5 shadow-card"
        >
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (pathname?.startsWith(`${item.href}/`) ?? false);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors focus-visible:outline-none ${
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center ${
                    active ? "text-emerald-600" : "text-slate-500"
                  }`}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MobileDrawer({
  primaryItems,
  settingsItems,
  settingsLabel,
  menuLabel,
  closeLabel,
  notificationsLabel,
  notificationsTitle,
  unreadCount,
  signOutLabel,
  onSignOut,
  memberships,
  currentBusinessId,
}: {
  primaryItems: NavItem[];
  settingsItems: NavItem[];
  settingsLabel: string;
  menuLabel: string;
  closeLabel: string;
  notificationsLabel: string;
  notificationsTitle: string;
  unreadCount: number;
  signOutLabel: string;
  onSignOut: () => void;
  memberships: { businessId: string; businessName: string }[];
  currentBusinessId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Lock body scroll while the drawer is open so the page behind it stays put.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex rounded-xl p-2 text-ink-muted transition-colors hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        aria-label={menuLabel}
        aria-expanded={open}
      >
        <Menu className="h-5 w-5" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={menuLabel}
              className="absolute right-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-pop"
            >
              <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
                <span className="text-lg font-semibold tracking-tight text-ink">
                  Work Calendar
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex rounded-xl p-2 text-ink-muted transition-colors hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  aria-label={closeLabel}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto py-2">
                {memberships.length > 0 && (
                  <div className="px-4 pb-2 pt-1">
                    <BusinessSwitcher
                      memberships={memberships}
                      currentBusinessId={currentBusinessId}
                      fullWidth
                    />
                  </div>
                )}
                {primaryItems.map((item) => (
                  <DrawerLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    onNavigate={() => setOpen(false)}
                  />
                ))}

                <DrawerLink
                  href="/notifications"
                  label={notificationsTitle}
                  ariaLabel={notificationsLabel}
                  icon={<Bell className="h-5 w-5" />}
                  badge={unreadCount}
                  onNavigate={() => setOpen(false)}
                />

                {settingsItems.length > 0 && (
                  <>
                    <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {settingsLabel}
                    </p>
                    {settingsItems.map((item) => (
                      <DrawerLink
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        onNavigate={() => setOpen(false)}
                      />
                    ))}
                  </>
                )}
              </nav>

              <div className="border-t border-hairline p-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSignOut();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
                >
                  <span className="flex h-5 w-5 items-center justify-center text-slate-500">
                    <LogOut className="h-5 w-5" />
                  </span>
                  {signOutLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function DrawerLink({
  href,
  label,
  icon,
  ariaLabel,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  ariaLabel?: string;
  badge?: number;
  onNavigate: () => void;
}) {
  const active = useIsActive(href);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={ariaLabel ?? label}
      aria-current={active ? "page" : undefined}
      className={`mx-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none ${
        active
          ? "bg-emerald-50 font-medium text-emerald-700"
          : "text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100"
      }`}
    >
      <span
        className={`relative flex h-5 w-5 items-center justify-center ${
          active ? "text-emerald-600" : "text-slate-500"
        }`}
      >
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      {label}
    </Link>
  );
}

function BusinessSwitcher({
  memberships,
  currentBusinessId,
  fullWidth = false,
}: {
  memberships: { businessId: string; businessName: string }[];
  currentBusinessId: string | null;
  fullWidth?: boolean;
}) {
  const { update } = useSession();
  const router = useRouter();
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const switchBusiness = trpc.membership.switch.useMutation();

  const onSwitch = async (businessId: string) => {
    if (!businessId || businessId === currentBusinessId) return;
    setPending(true);
    try {
      // Validate membership server-side first, then push the new businessId
      // into the JWT via NextAuth's update trigger (handled in the jwt
      // callback), and finally refresh so server components re-read the role.
      await switchBusiness.mutateAsync({ businessId });
      await update({ businessId });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <select
      aria-label={t("nav.switchBusiness")}
      value={currentBusinessId ?? undefined}
      disabled={pending}
      onChange={(event) => {
        void onSwitch(event.target.value);
      }}
      className={
        fullWidth
          ? "flex w-full max-w-full rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:opacity-50"
          : "hidden max-w-40 truncate rounded-lg border border-hairline bg-white px-2 py-1 text-xs text-ink-muted focus-visible:outline-none focus-visible:border-emerald-500 disabled:opacity-50 sm:inline-flex"
      }
    >
      {memberships.map((m) => (
        <option key={m.businessId} value={m.businessId}>
          {m.businessName}
        </option>
      ))}
    </select>
  );
}
