"use client";

import { Filter, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DisplayStatus } from "@/domain/types";
import type { CalendarFilters } from "@/lib/calendar-events";
import { Button } from "@/interface/components/ui/button";

interface CalendarFiltersBarProps {
  filters: CalendarFilters;
  onChange: (next: CalendarFilters) => void;
  roleOptions: string[];
  workerOptions?: Array<{ id: string; name: string }>;
  showOverlayToggle?: boolean;
  overlayValue?: boolean;
  onOverlayChange?: (next: boolean) => void;
}

const STATUS_OPTIONS: DisplayStatus[] = [
  "Open",
  "Pending",
  "Approved/Filled",
  "Rejected",
  "Withdrawn",
  "Cancelled",
];

/**
 * Single-row filter bar for the calendar. State lives in the parent so the
 * filters can also be persisted to URL search params or other stores.
 */
export function CalendarFiltersBar({
  filters,
  onChange,
  roleOptions,
  workerOptions = [],
  showOverlayToggle = false,
  overlayValue = false,
  onOverlayChange,
}: CalendarFiltersBarProps) {
  const t = useTranslations();

  const hasAny =
    !!filters.role ||
    (filters.statuses && filters.statuses.length > 0) ||
    !!filters.workerId;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <span className="inline-flex items-center gap-1.5 px-2 text-xs font-medium text-slate-500">
        <Filter className="h-3.5 w-3.5" aria-hidden />
        {t("calendar.filters.label")}
      </span>

      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-600">{t("calendar.filters.role")}</span>
        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          value={filters.role ?? ""}
          onChange={(e) =>
            onChange({ ...filters, role: e.target.value || undefined })
          }
        >
          <option value="">{t("calendar.filters.any")}</option>
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-600">{t("calendar.filters.status")}</span>
        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          value={filters.statuses?.[0] ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              statuses: e.target.value
                ? [e.target.value as DisplayStatus]
                : undefined,
            })
          }
        >
          <option value="">{t("calendar.filters.any")}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {workerOptions.length > 0 && (
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-600">{t("calendar.filters.worker")}</span>
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={filters.workerId ?? ""}
            onChange={(e) =>
              onChange({ ...filters, workerId: e.target.value || undefined })
            }
          >
            <option value="">{t("calendar.filters.any")}</option>
            {workerOptions.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {showOverlayToggle && (
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={overlayValue}
            onChange={(e) => onOverlayChange?.(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          {t("calendar.filters.showAvailability")}
        </label>
      )}

      {hasAny && (
        <Button
          size="sm"
          variant="ghost"
          className={showOverlayToggle ? "" : "ml-auto"}
          onClick={() => onChange({})}
        >
          <X className="mr-1 h-3 w-3" />
          {t("calendar.filters.clear")}
        </Button>
      )}
    </div>
  );
}
