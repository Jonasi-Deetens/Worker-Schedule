import { useTranslations } from "next-intl";
import type { CalendarTimeFormat } from "@/interface/components/work-calendar";

interface TimeFormatToggleProps {
  value: CalendarTimeFormat;
  onChange: (next: CalendarTimeFormat) => void;
}

/**
 * 24h / 12h time-display switcher. Pure two-button segmented control —
 * compact enough to sit between bulk actions without crowding the header.
 */
export function TimeFormatToggle({ value, onChange }: TimeFormatToggleProps) {
  const t = useTranslations();
  return (
    <div
      role="group"
      aria-label={t("calendar.timeFormatAria")}
      className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-xs shadow-sm"
    >
      <button
        type="button"
        onClick={() => onChange("24h")}
        aria-pressed={value === "24h"}
        className={`px-2.5 py-1 font-medium rounded-[5px] transition ${
          value === "24h"
            ? "bg-emerald-700 text-white shadow-sm"
            : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        {t("calendar.timeFormat24")}
      </button>
      <button
        type="button"
        onClick={() => onChange("12h")}
        aria-pressed={value === "12h"}
        className={`px-2.5 py-1 font-medium rounded-[5px] transition ${
          value === "12h"
            ? "bg-emerald-700 text-white shadow-sm"
            : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        {t("calendar.timeFormat12")}
      </button>
    </div>
  );
}
