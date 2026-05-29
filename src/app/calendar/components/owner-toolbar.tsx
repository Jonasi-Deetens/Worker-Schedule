import { useTranslations } from "next-intl";
import { CheckSquare, Plus, Send } from "lucide-react";
import { startOfWeek } from "date-fns";
import { Button } from "@/interface/components/ui/button";

interface OwnerToolbarProps {
  onPublishWeek: () => void;
  onDuplicateWeek: (input: { fromWeekStart: Date; toWeekStart: Date }) => void;
  onCancelDay: (date: Date) => void;
  onNewShift: () => void;
  isPublishing: boolean;
  isDuplicating: boolean;
  isCancellingDay: boolean;
  /** Bulk-select mode: lets the owner pick shifts and move them together. */
  bulkMode: boolean;
  onToggleBulkMode: () => void;
  selectedCount: number;
  onOpenBulkReschedule: () => void;
}

/**
 * Top-right cluster of owner-only actions that sit next to the page title:
 * publish-week, duplicate-week, cancel-today, and the "new shift" CTA.
 * Encapsulating the cluster lets the page composition file stay focused on
 * layout while the click handlers all live in the page's mutation hook.
 */
export function OwnerToolbar({
  onPublishWeek,
  onDuplicateWeek,
  onCancelDay,
  onNewShift,
  isPublishing,
  isDuplicating,
  isCancellingDay,
  bulkMode,
  onToggleBulkMode,
  selectedCount,
  onOpenBulkReschedule,
}: OwnerToolbarProps) {
  const t = useTranslations();

  // In bulk-select mode the toolbar collapses to the selection controls so the
  // owner can focus on picking shifts and applying one offset to them all.
  if (bulkMode) {
    return (
      <>
        <span className="text-sm font-medium text-slate-700">
          {t("bulk.selectedCount", { count: selectedCount })}
        </span>
        <Button
          onClick={onOpenBulkReschedule}
          size="sm"
          disabled={selectedCount === 0}
        >
          {t("bulk.rescheduleSelected")}
        </Button>
        <Button onClick={onToggleBulkMode} size="sm" variant="outline">
          {t("bulk.exitSelect")}
        </Button>
      </>
    );
  }

  return (
    <>
      <Button
        onClick={onToggleBulkMode}
        size="sm"
        variant="outline"
        title={t("bulk.bulkEditHint")}
      >
        <CheckSquare className="mr-1 h-4 w-4" />
        {t("bulk.bulkEdit")}
      </Button>
      <Button
        onClick={onPublishWeek}
        size="sm"
        variant="outline"
        disabled={isPublishing}
      >
        <Send className="mr-1 h-4 w-4" />
        {t("calendar.publishWeek")}
      </Button>
      <Button
        onClick={() => {
          const today = new Date();
          const fromWeek = startOfWeek(today, { weekStartsOn: 1 });
          const toWeek = new Date(fromWeek.getTime() + 7 * 86_400_000);
          onDuplicateWeek({ fromWeekStart: fromWeek, toWeekStart: toWeek });
        }}
        size="sm"
        variant="outline"
        disabled={isDuplicating}
        title={t("bulk.duplicateWeekHint")}
      >
        {t("bulk.duplicateWeek")}
      </Button>
      <Button
        onClick={() => {
          if (!window.confirm(t("bulk.confirmCancelToday"))) return;
          onCancelDay(new Date());
        }}
        size="sm"
        variant="outline"
        disabled={isCancellingDay}
        title={t("bulk.cancelDayHint")}
      >
        {t("bulk.cancelDay")}
      </Button>
      <Button onClick={onNewShift} size="sm">
        <Plus className="mr-1 h-4 w-4" />
        {t("calendar.newShift")}
      </Button>
    </>
  );
}
