import type { DisplayStatus } from "@/domain/types";

/**
 * Rich palette used by FullCalendar (which expects raw CSS color values).
 * Each status carries a vivid surface color, a darker accent for the left
 * border, a soft mid-tone for the progress bar track, and a high-contrast
 * text color. Pairs with `STATUS_COLORS` for badges and legends.
 */
export const STATUS_HEX: Record<
  DisplayStatus,
  {
    bg: string;
    bgGradient: string;
    accent: string;
    track: string;
    border: string;
    text: string;
  }
> = {
  Open: {
    bg: "#2563eb",
    bgGradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    accent: "#1d4ed8",
    track: "rgba(255,255,255,0.28)",
    border: "#1d4ed8",
    text: "#ffffff",
  },
  Pending: {
    bg: "#f59e0b",
    bgGradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
    accent: "#b45309",
    track: "rgba(120,53,15,0.25)",
    border: "#b45309",
    text: "#1f2937",
  },
  "Approved/Filled": {
    bg: "#16a34a",
    bgGradient: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
    accent: "#166534",
    track: "rgba(255,255,255,0.3)",
    border: "#166534",
    text: "#ffffff",
  },
  Rejected: {
    bg: "#ef4444",
    bgGradient: "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
    accent: "#b91c1c",
    track: "rgba(255,255,255,0.28)",
    border: "#b91c1c",
    text: "#ffffff",
  },
  Withdrawn: {
    bg: "#94a3b8",
    bgGradient: "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
    accent: "#475569",
    track: "rgba(255,255,255,0.32)",
    border: "#64748b",
    text: "#1f2937",
  },
  Cancelled: {
    bg: "#9ca3af",
    bgGradient:
      "repeating-linear-gradient(135deg, #d1d5db 0px, #d1d5db 6px, #9ca3af 6px, #9ca3af 12px)",
    accent: "#4b5563",
    track: "rgba(255,255,255,0.25)",
    border: "#6b7280",
    text: "#111827",
  },
};

export const AVAILABILITY_HEX = {
  bg: "#ede9fe",
  bgGradient: "linear-gradient(135deg, #f5f3ff 0%, #ddd6fe 100%)",
  accent: "#7c3aed",
  border: "#a78bfa",
  text: "#5b21b6",
  track: "rgba(91,33,182,0.18)",
} as const;

export const STATUS_COLORS: Record<
  DisplayStatus,
  { bg: string; text: string; border: string; label: string }
> = {
  Open: {
    bg: "bg-blue-50",
    text: "text-blue-900",
    border: "border-blue-300",
    label: "Open",
  },
  Pending: {
    bg: "bg-amber-50",
    text: "text-amber-900",
    border: "border-amber-300",
    label: "Pending",
  },
  "Approved/Filled": {
    bg: "bg-green-50",
    text: "text-green-900",
    border: "border-green-300",
    label: "Approved",
  },
  Rejected: {
    bg: "bg-red-50",
    text: "text-red-900",
    border: "border-red-300",
    label: "Rejected",
  },
  Withdrawn: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-300",
    label: "Withdrawn",
  },
  Cancelled: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-300",
    label: "Cancelled",
  },
};

export function getStatusClasses(status: DisplayStatus) {
  return STATUS_COLORS[status];
}
