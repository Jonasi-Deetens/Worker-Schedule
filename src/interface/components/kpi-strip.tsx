"use client";

import { useTranslations } from "next-intl";
import { Banknote, CalendarClock, CheckCircle2, Coins, Hourglass, Users } from "lucide-react";

interface KpiData {
  open: number;
  pending: number;
  filled: number;
  capacityPct: number;
  labourCost?: number;
  costPerHour?: number;
}

interface KpiStripProps {
  data: KpiData | null;
  isLoading?: boolean;
}

/**
 * Compact 4-card metrics strip rendered above the owner's staffing calendar.
 * Loading state shows skeletons in place so the layout doesn't shift.
 */
export function KpiStrip({ data, isLoading }: KpiStripProps) {
  const t = useTranslations();

  const cards = [
    {
      key: "open",
      label: t("calendar.kpi.open"),
      value: data?.open,
      icon: CalendarClock,
      tone: "text-sky-600 bg-sky-50",
    },
    {
      key: "pending",
      label: t("calendar.kpi.pending"),
      value: data?.pending,
      icon: Hourglass,
      tone: "text-amber-600 bg-amber-50",
    },
    {
      key: "filled",
      label: t("calendar.kpi.filled"),
      value: data?.filled,
      icon: CheckCircle2,
      tone: "text-emerald-600 bg-emerald-50",
    },
    {
      key: "capacity",
      label: t("calendar.kpi.capacity"),
      value: data ? `${data.capacityPct}%` : undefined,
      icon: Users,
      tone: "text-emerald-600 bg-emerald-50",
    },
    {
      key: "labourCost",
      label: t("calendar.kpi.labourCost"),
      value:
        data && typeof data.labourCost === "number"
          ? `€${data.labourCost.toFixed(2)}`
          : undefined,
      icon: Banknote,
      tone: "text-fuchsia-600 bg-fuchsia-50",
    },
    {
      key: "costPerHour",
      label: t("calendar.kpi.costPerHour"),
      value:
        data && typeof data.costPerHour === "number"
          ? `€${data.costPerHour.toFixed(2)}`
          : undefined,
      icon: Coins,
      tone: "text-amber-600 bg-amber-50",
    },
  ];

  return (
    <div
      className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      role="group"
      aria-label="Staffing metrics"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${card.tone}`}
              aria-hidden
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{card.label}</p>
              {isLoading || card.value === undefined ? (
                <span
                  className="mt-0.5 inline-block h-5 w-12 animate-pulse rounded bg-slate-100"
                  aria-hidden
                />
              ) : (
                <p className="text-lg font-semibold text-slate-900">
                  {card.value}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
