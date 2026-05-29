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
    bgGradient: "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)",
    accent: "#1d4ed8",
    track: "rgba(255,255,255,0.28)",
    border: "#1d4ed8",
    text: "#ffffff",
  },
  Pending: {
    bg: "#f59e0b",
    bgGradient: "linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)",
    accent: "#b45309",
    track: "rgba(120,53,15,0.25)",
    border: "#b45309",
    text: "#1f2937",
  },
  "Approved/Filled": {
    bg: "#059669",
    bgGradient: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
    accent: "#047857",
    track: "rgba(255,255,255,0.3)",
    border: "#047857",
    text: "#ffffff",
  },
  Rejected: {
    bg: "#ef4444",
    bgGradient: "linear-gradient(135deg, #ef4444 0%, #991b1b 100%)",
    accent: "#b91c1c",
    track: "rgba(255,255,255,0.28)",
    border: "#b91c1c",
    text: "#ffffff",
  },
  Withdrawn: {
    bg: "#94a3b8",
    bgGradient: "linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)",
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
    text: "text-blue-700",
    border: "border-blue-100",
    label: "Open",
  },
  Pending: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-100",
    label: "Pending",
  },
  "Approved/Filled": {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-100",
    label: "Approved",
  },
  Rejected: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-100",
    label: "Rejected",
  },
  Withdrawn: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
    label: "Withdrawn",
  },
  Cancelled: {
    bg: "bg-gray-100",
    text: "text-gray-500",
    border: "border-gray-200",
    label: "Cancelled",
  },
};

export function getStatusClasses(status: DisplayStatus) {
  return STATUS_COLORS[status];
}

export interface CalendarEventSurface {
  accent: string;
  fill: string;
  text: "#000000" | "#ffffff";
  textHover: "#000000" | "#ffffff";
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

/** Mixes a hex color with white; `accentWeight` is the share of the accent hue. */
export function mixHexWithWhite(hex: string, accentWeight: number): string {
  const { r, g, b } = parseHex(hex);
  const whiteWeight = 1 - accentWeight;
  return toHex(
    r * accentWeight + 255 * whiteWeight,
    g * accentWeight + 255 * whiteWeight,
    b * accentWeight + 255 * whiteWeight,
  );
}

/** Picks black or white label text for readable contrast on a solid fill. */
export function contrastTextOnBackground(hex: string): "#000000" | "#ffffff" {
  const { r, g, b } = parseHex(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.45 ? "#000000" : "#ffffff";
}

/** Calendar pill: bold left accent + ~10% tint fill + contrast-safe text. */
export function calendarEventSurface(
  status: DisplayStatus | "Available",
): CalendarEventSurface {
  const accent =
    status === "Available"
      ? AVAILABILITY_HEX.accent
      : STATUS_HEX[status].accent;
  const fill = mixHexWithWhite(accent, 0.1);
  return {
    accent,
    fill,
    text: contrastTextOnBackground(fill),
    textHover: contrastTextOnBackground(accent),
  };
}
