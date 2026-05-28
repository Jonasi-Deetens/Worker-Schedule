import type { DisplayStatus } from "@/domain/types";
import { getStatusClasses } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: DisplayStatus;
  className?: string;
}) {
  const colors = getStatusClasses(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        colors.bg,
        colors.text,
        colors.border,
        className,
      )}
    >
      {colors.label}
    </span>
  );
}
