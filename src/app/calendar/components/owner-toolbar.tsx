import { useTranslations } from "next-intl";
import { Plus, Send } from "lucide-react";
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
}: OwnerToolbarProps) {
  const t = useTranslations();
  return (
    <>
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
