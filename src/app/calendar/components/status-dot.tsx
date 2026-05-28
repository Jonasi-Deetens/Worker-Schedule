import { useTranslations } from "next-intl";
import type { DisplayStatus } from "@/domain/types";
import { STATUS_HEX } from "@/lib/status-colors";

const DISPLAY_STATUSES: DisplayStatus[] = [
  "Open",
  "Pending",
  "Approved/Filled",
  "Rejected",
  "Withdrawn",
  "Cancelled",
];

export function StatusDot({ status }: { status: DisplayStatus }) {
  const palette = STATUS_HEX[status];
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: palette.bg, boxShadow: `inset 0 0 0 1px ${palette.accent}` }}
      aria-hidden
    />
  );
}

function statusKey(status: DisplayStatus): string {
  switch (status) {
    case "Open":
      return "status.open";
    case "Pending":
      return "status.pending";
    case "Approved/Filled":
      return "status.filled";
    case "Rejected":
      return "status.rejected";
    case "Withdrawn":
      return "status.withdrawn";
    case "Cancelled":
      return "status.cancelled";
  }
}

/**
 * Color legend rendered under the calendar grid. Encapsulating it here keeps
 * the page composition focused on layout rather than each badge's markup.
 */
export function StatusLegend() {
  const t = useTranslations();
  return (
    <div className="mt-6 flex flex-wrap gap-2.5 text-xs">
      {DISPLAY_STATUSES.map((status) => (
        <span
          key={status}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700 shadow-sm"
        >
          <StatusDot status={status} />
          <span className="font-medium">{t(statusKey(status))}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800 shadow-sm">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full border border-violet-400"
          style={{ background: "#a78bfa" }}
          aria-hidden
        />
        <span className="font-medium">{t("availability.available")}</span>
      </span>
    </div>
  );
}
