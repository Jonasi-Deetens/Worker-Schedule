"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useBusinessEvents } from "@/interface/hooks/use-business-events";
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Clock,
  MapPin,
  PhoneCall,
  Sparkles,
  Timer,
} from "lucide-react";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import { formatTimeRange } from "@/lib/calendar-utils";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

function relative(from: Date, t: ReturnType<typeof useTranslations>): string {
  const ms = from.getTime() - Date.now();
  if (ms <= 0) return t("me.now");
  const minutes = Math.round(ms / MS_PER_MINUTE);
  if (minutes < 60) return t("me.inMinutes", { count: minutes });
  const hours = Math.round(ms / MS_PER_HOUR);
  if (hours < 36) return t("me.inHours", { count: hours });
  const days = Math.round(ms / (24 * MS_PER_HOUR));
  return t("me.inDays", { count: days });
}

export function MeHomeClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const dashboardQuery = trpc.me.dashboard.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });

  // Live updates: invalidate the dashboard when something relevant changes on
  // the business stream. We deliberately invalidate rather than patch in
  // place — the server-derived shape (next shift, broadcasts, unread counts)
  // is small and the user has at most one /me tab open at a time.
  const onLiveEvent = useCallback(
    (event: string) => {
      if (
        event === "shift.updated" ||
        event === "assignment.changed" ||
        event === "subscription.changed"
      ) {
        utils.me.dashboard.invalidate();
      }
    },
    [utils.me.dashboard],
  );
  useBusinessEvents(onLiveEvent);
  const accept = trpc.shift.acceptBroadcast.useMutation({
    onSuccess: () => {
      toast.success(t("applications.broadcastAccepted"));
      utils.me.dashboard.invalidate();
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  const nextShift = dashboardQuery.data?.nextShift ?? null;
  const startsAt = useMemo(
    () => (nextShift ? new Date(nextShift.startsAt) : null),
    [nextShift],
  );
  const endsAt = useMemo(
    () => (nextShift ? new Date(nextShift.endsAt) : null),
    [nextShift],
  );

  const clockInWindow = useMemo(() => {
    if (!startsAt || !endsAt) return false;
    const now = Date.now();
    return now >= startsAt.getTime() - 15 * MS_PER_MINUTE && now < endsAt.getTime();
  }, [startsAt, endsAt]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">
          {t("me.greeting")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t("me.subtitle")}</p>
      </header>

      {/* Next shift hero */}
      <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
          <CalendarDays className="h-4 w-4" />
          {t("me.nextShift")}
        </div>
        {dashboardQuery.isLoading && (
          <p className="mt-3 text-sm text-slate-500">…</p>
        )}
        {!dashboardQuery.isLoading && !nextShift && (
          <div className="mt-3">
            <p className="text-sm text-slate-600">{t("me.noNextShift")}</p>
            <Link
              href="/calendar"
              className="mt-3 inline-flex text-sm font-medium text-indigo-600 hover:underline"
            >
              {t("me.findShifts")}
            </Link>
          </div>
        )}
        {nextShift && startsAt && endsAt && (
          <div className="mt-3 space-y-2">
            <div className="text-2xl font-semibold text-slate-900">
              {nextShift.roleLabel}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4 text-indigo-600" />
                {startsAt.toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}{" "}
                · {formatTimeRange(startsAt, endsAt)}
              </span>
              {nextShift.locationName && (
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <MapPin className="h-4 w-4" />
                  {nextShift.locationName}
                </span>
              )}
            </div>
            <div className="text-sm font-medium text-indigo-700">
              {relative(startsAt, t)}
            </div>
            {nextShift.notes && (
              <p className="rounded-md bg-white/70 p-2 text-xs text-slate-600">
                {nextShift.notes}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {clockInWindow && (
                <Link href="/clock">
                  <Button size="sm">
                    <Timer className="mr-1.5 h-4 w-4" />
                    {t("me.clockIn")}
                  </Button>
                </Link>
              )}
              <Link href="/calendar">
                <Button size="sm" variant="outline">
                  {t("me.openCalendar")}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Stat row */}
      <section className="mt-4 grid grid-cols-3 gap-3">
        <StatCard
          icon={<ClipboardList className="h-4 w-4 text-amber-600" />}
          label={t("me.pendingApplications")}
          value={dashboardQuery.data?.pendingApplications ?? 0}
          href="/applications"
        />
        <StatCard
          icon={<Bell className="h-4 w-4 text-rose-600" />}
          label={t("me.unread")}
          value={dashboardQuery.data?.unreadNotifications ?? 0}
          href="/notifications"
        />
        <StatCard
          icon={<Clock className="h-4 w-4 text-emerald-600" />}
          label={t("me.weekHours")}
          value={
            dashboardQuery.data
              ? Math.round(dashboardQuery.data.scheduledHoursThisWeek * 10) / 10
              : 0
          }
          href="/me/hours"
        />
      </section>

      {/* Broadcasts */}
      {dashboardQuery.data?.broadcasts &&
        dashboardQuery.data.broadcasts.length > 0 && (
          <section className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <PhoneCall className="h-4 w-4" />
              {t("applications.broadcastsTitle")}
            </div>
            <ul className="space-y-2">
              {dashboardQuery.data.broadcasts.map((s) => {
                const start = new Date(s.startsAt);
                const end = new Date(s.endsAt);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
                  >
                    <div>
                      <div className="font-medium text-slate-900">
                        {s.roleLabel}
                      </div>
                      <div className="text-xs text-slate-600">
                        {start.toLocaleDateString()} · {formatTimeRange(start, end)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => accept.mutate({ shiftId: s.id })}
                      disabled={accept.isPending}
                    >
                      {t("shift.acceptBroadcast")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

      {/* Availability quick-set */}
      <AvailabilityStrip />

      {/* Quick links */}
      <section className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("me.quickLinks")}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <QuickLink href="/calendar" label={t("calendar.title")} icon={<CalendarDays className="h-4 w-4" />} />
          <QuickLink href="/applications" label={t("applications.title")} icon={<ClipboardList className="h-4 w-4" />} />
          <QuickLink href="/swap" label={t("swap.title")} icon={<Sparkles className="h-4 w-4" />} />
          <QuickLink href="/timeoff" label={t("timeOff.title")} icon={<CalendarDays className="h-4 w-4" />} />
          <QuickLink href="/me/hours" label={t("hours.title")} icon={<Clock className="h-4 w-4" />} />
          <QuickLink href="/settings/profile" label={t("profile.title")} icon={<Bell className="h-4 w-4" />} />
        </div>
      </section>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-indigo-300 hover:shadow"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </Link>
  );
}

/**
 * 14-day horizontal strip the worker can tap to mark themselves available for
 * the configured default slot. Tap again to clear. Heavily mobile-optimised:
 * cells are large enough for thumbs, the active state has high contrast, and
 * we use optimistic updates so the tap feels instant on bad networks.
 */
function AvailabilityStrip() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);
  const from = days[0]!;
  const to = useMemo(() => {
    const t2 = new Date(days[days.length - 1]!);
    t2.setDate(t2.getDate() + 1);
    return t2;
  }, [days]);

  const list = trpc.availability.list.useQuery({ from, to });
  const setMutation = trpc.availability.set.useMutation({
    onSuccess: () => utils.availability.list.invalidate(),
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const deleteMutation = trpc.availability.delete.useMutation({
    onSuccess: () => utils.availability.list.invalidate(),
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  // Quick toggle uses a sensible default slot of 09:00–17:00 local time.
  const toggleDay = (day: Date) => {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const existing = (list.data ?? []).find((a) => {
      const s = new Date(a.startsAt);
      return s >= dayStart && s < dayEnd;
    });
    if (existing) {
      deleteMutation.mutate({ id: existing.id });
    } else {
      const start = new Date(dayStart);
      start.setHours(9, 0, 0, 0);
      const end = new Date(dayStart);
      end.setHours(17, 0, 0, 0);
      setMutation.mutate({ startsAt: start, endsAt: end });
    }
  };

  const availableDays = new Set(
    (list.data ?? []).map((a) => {
      const d = new Date(a.startsAt);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }),
  );

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("me.quickAvailability")}
        </div>
        <span className="text-[11px] text-slate-400">
          {t("me.quickAvailabilityHelp")}
        </span>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const isAvailable = availableDays.has(d.getTime());
          const isToday = d.getTime() === days[0]!.getTime();
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => toggleDay(d)}
              disabled={setMutation.isPending || deleteMutation.isPending}
              className={`flex min-w-[3.25rem] flex-col items-center rounded-xl border px-2 py-2 text-center transition ${
                isAvailable
                  ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300"
              } ${isToday ? "ring-2 ring-indigo-300" : ""}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide">
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span className="text-lg font-bold leading-none">
                {d.getDate()}
              </span>
              <span className="mt-1 text-[10px] text-slate-500">
                {isAvailable ? "9–17" : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function QuickLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700"
    >
      {icon}
      {label}
    </Link>
  );
}
