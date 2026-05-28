"use client";

import { useMemo } from "react";

/**
 * Cheap deterministic colour from any string. Mirrors the trick Slack and
 * Linear use for fallback initials so two workers with the same first letters
 * still get visually distinct chips.
 */
function colorFor(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const palette = [
    { bg: "#fee2e2", fg: "#991b1b" }, // rose
    { bg: "#fef3c7", fg: "#92400e" }, // amber
    { bg: "#dcfce7", fg: "#166534" }, // emerald
    { bg: "#dbeafe", fg: "#1e40af" }, // blue
    { bg: "#ede9fe", fg: "#5b21b6" }, // violet
    { bg: "#cffafe", fg: "#155e75" }, // cyan
    { bg: "#fce7f3", fg: "#9d174d" }, // pink
    { bg: "#fed7aa", fg: "#9a3412" }, // orange
  ];
  return palette[Math.abs(hash) % palette.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "?";
}

const SIZES = {
  xs: { box: 18, text: 9, ring: 1.5 },
  sm: { box: 24, text: 10, ring: 1.5 },
  md: { box: 32, text: 12, ring: 2 },
  lg: { box: 40, text: 14, ring: 2 },
  xl: { box: 64, text: 22, ring: 2 },
} as const;

export type AvatarSize = keyof typeof SIZES;

export interface AvatarProps {
  name: string;
  url?: string | null;
  size?: AvatarSize;
  /** Renders a 1.5–2px ring of this colour (defaults to white for stack). */
  ringColor?: string;
  className?: string;
  title?: string;
}

/**
 * Single avatar bubble. Uses an `<img>` for an actual photo and falls back
 * to a coloured circle with initials when the URL is missing or fails.
 */
export function Avatar({
  name,
  url,
  size = "md",
  ringColor,
  className,
  title,
}: AvatarProps) {
  const conf = SIZES[size];
  const colors = useMemo(() => colorFor(name || "?"), [name]);
  const ringStyle = ringColor
    ? { boxShadow: `0 0 0 ${conf.ring}px ${ringColor}` }
    : undefined;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        title={title ?? name}
        width={conf.box}
        height={conf.box}
        className={`inline-block rounded-full object-cover ${className ?? ""}`}
        style={{
          width: conf.box,
          height: conf.box,
          ...(ringStyle ?? {}),
        }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      title={title ?? name}
      className={`inline-flex items-center justify-center rounded-full font-semibold ${className ?? ""}`}
      style={{
        width: conf.box,
        height: conf.box,
        background: colors.bg,
        color: colors.fg,
        fontSize: conf.text,
        lineHeight: 1,
        ...(ringStyle ?? {}),
      }}
    >
      {initials(name)}
    </span>
  );
}

export interface AvatarStackProps {
  people: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  size?: AvatarSize;
  /** Show at most this many faces; the rest collapse into a "+N" pill. */
  max?: number;
  /** Background ring colour — should match the surface the stack sits on. */
  ringColor?: string;
  className?: string;
}

/**
 * Overlapping row of avatars (Slack / Linear style) with a "+N" overflow pill.
 * Slightly negative left margin on each face creates the cascading look; the
 * outer ring keeps adjacent faces visually separated.
 */
export function AvatarStack({
  people,
  size = "sm",
  max = 4,
  ringColor = "#ffffff",
  className,
}: AvatarStackProps) {
  if (people.length === 0) return null;
  const visible = people.slice(0, max);
  const rest = people.length - visible.length;
  const conf = SIZES[size];
  const overlap = Math.max(6, Math.floor(conf.box * 0.35));

  return (
    <div className={`inline-flex items-center ${className ?? ""}`}>
      {visible.map((p, i) => (
        <span
          key={p.id}
          style={{ marginLeft: i === 0 ? 0 : -overlap }}
          className="inline-flex"
        >
          <Avatar
            name={p.name}
            url={p.avatarUrl ?? undefined}
            size={size}
            ringColor={ringColor}
            title={p.name}
          />
        </span>
      ))}
      {rest > 0 && (
        <span
          style={{
            marginLeft: -overlap,
            width: conf.box,
            height: conf.box,
            fontSize: conf.text,
            boxShadow: `0 0 0 ${conf.ring}px ${ringColor}`,
          }}
          className="inline-flex items-center justify-center rounded-full bg-slate-700 font-semibold text-white"
          aria-label={`${rest} more`}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
