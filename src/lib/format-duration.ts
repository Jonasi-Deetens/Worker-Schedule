/**
 * Formats a worked duration as an unambiguous "{h}h {mm}m" string with
 * zero-padded minutes (e.g. 68 -> "1h 08m", 48 -> "0h 48m", 20 -> "0h 20m").
 *
 * Keeps the underlying minute math intact; this is presentation only so that
 * gross/break/net read consistently and subtractions stay visually obvious.
 */
export function formatDuration(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
