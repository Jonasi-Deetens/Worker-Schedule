"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { trpc } from "@/interface/trpc/client";
import { Button } from "@/interface/components/ui/button";

interface Props {
  shiftId: string;
  /** Workers already approved/assigned — excluded from suggestions. */
  assignedUserIds?: ReadonlyArray<string>;
  onAssign?: (workerId: string) => void;
  disabled?: boolean;
}

/**
 * Renders the rule-based staffing suggestions for a shift. Top 5 candidates
 * are shown with the human-readable reasons behind their score so the planner
 * understands the ranking at a glance.
 */
export function StaffingSuggestionsPanel({
  shiftId,
  assignedUserIds = [],
  onAssign,
  disabled,
}: Props) {
  const t = useTranslations();
  const { data, isLoading } = trpc.staffing.suggest.useQuery(
    { shiftId },
    { enabled: Boolean(shiftId), staleTime: 30_000 },
  );

  const ids = new Set(assignedUserIds);
  const top = (data ?? []).filter((c) => !ids.has(c.userId)).slice(0, 5);
  if (!isLoading && top.length === 0) return null;

  return (
    <section className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">
        <Sparkles className="h-3.5 w-3.5" />
        {t("suggestions.title")}
      </div>
      {isLoading && (
        <p className="text-xs text-slate-500">{t("suggestions.loading")}</p>
      )}
      <ul className="space-y-2">
        {top.map((c) => (
          <li
            key={c.userId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 ring-1 ring-indigo-100"
          >
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-medium text-slate-900">{c.name}</span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                  {c.score}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {c.reasons.map((r) => r.label).join(" · ") || "—"}
              </div>
            </div>
            {onAssign && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAssign(c.userId)}
                disabled={disabled}
              >
                {t("suggestions.assign")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
