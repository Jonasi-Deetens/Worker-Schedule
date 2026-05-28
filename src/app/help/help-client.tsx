"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Bell,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Clock,
  Code2,
  FileText,
  Globe,
  KeyRound,
  LayoutGrid,
  MessageSquare,
  Repeat,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Timer,
  UserCircle,
  Users,
} from "lucide-react";

type Audience = "worker" | "owner" | "manager" | "all";

interface HelpSection {
  /** Stable id used both as anchor and as i18n key prefix (`help.s.<id>.*`). */
  id: string;
  audience: Audience[];
  icon: React.ReactNode;
  /** How many bullet steps the section has under `help.s.<id>.steps.<n>`. */
  steps: number;
  /** Optional tip key under `help.s.<id>.tip`. */
  hasTip?: boolean;
}

const SECTIONS: HelpSection[] = [
  {
    id: "gettingStarted",
    audience: ["all"],
    icon: <Sparkles className="h-4 w-4" />,
    steps: 4,
  },
  {
    id: "calendar",
    audience: ["worker", "manager", "owner"],
    icon: <CalendarDays className="h-4 w-4" />,
    steps: 4,
    hasTip: true,
  },
  {
    id: "myHome",
    audience: ["worker"],
    icon: <LayoutGrid className="h-4 w-4" />,
    steps: 4,
  },
  {
    id: "availability",
    audience: ["worker"],
    icon: <Clock className="h-4 w-4" />,
    steps: 3,
    hasTip: true,
  },
  {
    id: "applications",
    audience: ["worker"],
    icon: <ClipboardList className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "swaps",
    audience: ["worker"],
    icon: <Repeat className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "broadcasts",
    audience: ["worker", "manager", "owner"],
    icon: <Send className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "timeClock",
    audience: ["worker", "manager", "owner"],
    icon: <Timer className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "timeOff",
    audience: ["worker", "manager", "owner"],
    icon: <CalendarDays className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "documents",
    audience: ["worker", "manager", "owner"],
    icon: <FileText className="h-4 w-4" />,
    steps: 4,
  },
  {
    id: "notifications",
    audience: ["all"],
    icon: <Bell className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "icsFeed",
    audience: ["all"],
    icon: <Globe className="h-4 w-4" />,
    steps: 3,
    hasTip: true,
  },
  {
    id: "profile",
    audience: ["all"],
    icon: <UserCircle className="h-4 w-4" />,
    steps: 3,
  },

  // ─── Owner / manager ───
  {
    id: "workersDirectory",
    audience: ["manager", "owner"],
    icon: <Users className="h-4 w-4" />,
    steps: 4,
  },
  {
    id: "shiftsPlanner",
    audience: ["manager", "owner"],
    icon: <CalendarDays className="h-4 w-4" />,
    steps: 5,
    hasTip: true,
  },
  {
    id: "bulkOps",
    audience: ["manager", "owner"],
    icon: <Repeat className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "aiSuggestions",
    audience: ["manager", "owner"],
    icon: <Sparkles className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "approvals",
    audience: ["manager", "owner"],
    icon: <ClipboardList className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "attendance",
    audience: ["manager", "owner"],
    icon: <ShieldCheck className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "skillsRoster",
    audience: ["manager", "owner"],
    icon: <Briefcase className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "insights",
    audience: ["manager", "owner"],
    icon: <BarChart3 className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "payroll",
    audience: ["manager", "owner"],
    icon: <FileText className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "dimona",
    audience: ["owner"],
    icon: <ShieldCheck className="h-4 w-4" />,
    steps: 3,
    hasTip: true,
  },
  {
    id: "messaging",
    audience: ["manager", "owner", "worker"],
    icon: <MessageSquare className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "audit",
    audience: ["owner"],
    icon: <ShieldCheck className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "developers",
    audience: ["owner"],
    icon: <Code2 className="h-4 w-4" />,
    steps: 4,
    hasTip: true,
  },
  {
    id: "settings",
    audience: ["owner"],
    icon: <Settings className="h-4 w-4" />,
    steps: 3,
  },
  {
    id: "security",
    audience: ["all"],
    icon: <KeyRound className="h-4 w-4" />,
    steps: 3,
  },
];

type AudienceRole = Exclude<Audience, "all">;

/**
 * Maps a raw session role to the audience tag we use in the section table.
 * Unknown roles fall back to "worker" — the most restricted view.
 */
function audienceFromRole(role: string): AudienceRole {
  if (role === "OWNER") return "owner";
  if (role === "MANAGER") return "manager";
  return "worker";
}

function matches(section: HelpSection, viewer: AudienceRole): boolean {
  if (section.audience.includes("all")) return true;
  return section.audience.includes(viewer);
}

function audienceBadge(
  audience: Audience[],
  t: ReturnType<typeof useTranslations>,
): { label: string; className: string } | null {
  if (audience.includes("all")) {
    return {
      label: t("help.badge.all"),
      className: "bg-slate-100 text-slate-700",
    };
  }
  const labels: string[] = [];
  if (audience.includes("owner")) labels.push(t("help.badge.owner"));
  if (audience.includes("manager")) labels.push(t("help.badge.manager"));
  if (audience.includes("worker")) labels.push(t("help.badge.worker"));
  return {
    label: labels.join(" · "),
    className: audience.includes("worker") && audience.length === 1
      ? "bg-emerald-100 text-emerald-800"
      : "bg-indigo-100 text-indigo-800",
  };
}

export function HelpClient({ role }: { role: string }) {
  const t = useTranslations();

  // Visibility is driven entirely by the session role; there is no override
  // in the UI. Showing the wrong audience clutters the page and tends to
  // confuse non-technical users more than it helps.
  const viewer = audienceFromRole(role);
  const visible = useMemo(
    () => SECTIONS.filter((s) => matches(s, viewer)),
    [viewer],
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">{t("help.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("help.subtitle")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        {/* Sticky table of contents */}
        <nav
          className="hidden lg:sticky lg:top-20 lg:block lg:h-fit lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
          aria-label={t("help.tocAria")}
        >
          <ol className="space-y-0.5 text-sm">
            {visible.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-slate-700 hover:bg-white hover:text-indigo-700"
                >
                  <span className="text-slate-400">{s.icon}</span>
                  <span className="truncate">
                    {t(`help.s.${s.id}.title`)}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-6">
          {visible.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              {t("help.empty")}
            </p>
          )}
          {visible.map((s) => {
            const badge = audienceBadge(s.audience, t);
            return (
              <section
                key={s.id}
                id={s.id}
                className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-indigo-50 p-1.5 text-indigo-700">
                    {s.icon}
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {t(`help.s.${s.id}.title`)}
                  </h2>
                  {badge && (
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  )}
                </div>
                <p className="mb-3 text-sm leading-relaxed text-slate-600">
                  {t(`help.s.${s.id}.intro`)}
                </p>
                <ol className="ml-5 list-decimal space-y-1.5 text-sm leading-relaxed text-slate-700 marker:text-slate-400">
                  {Array.from({ length: s.steps }).map((_, i) => (
                    <li key={i}>{t(`help.s.${s.id}.steps.${i + 1}`)}</li>
                  ))}
                </ol>
                {s.hasTip && (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs leading-relaxed text-amber-900">
                    <span className="font-semibold">{t("help.tipLabel")} </span>
                    {t(`help.s.${s.id}.tip`)}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
