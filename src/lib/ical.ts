import { createHmac, createHash } from "node:crypto";

const PRODID = "-//Tattoogenda//Work Calendar//EN";

export interface IcalEvent {
  uid: string;
  summary: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Formats a Date into iCal UTC format (YYYYMMDDTHHmmssZ). All timestamps are
 * normalised to UTC so the resulting feed is timezone-agnostic.
 */
export function formatIcalDate(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Builds a minimal RFC 5545 compatible VCALENDAR document from a list of
 * events. Lines longer than 75 octets are not folded because none of the
 * fields we emit hit that limit in practice.
 */
export function buildIcal(input: {
  events: IcalEvent[];
  calendarName: string;
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.calendarName)}`,
  ];

  const now = formatIcalDate(new Date());
  for (const event of input.events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${formatIcalDate(event.startsAt)}`);
    lines.push(`DTEND:${formatIcalDate(event.endsAt)}`);
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/**
 * Derives a deterministic share token for a user, used for unauthenticated
 * iCal feed access. The token is derived from a server secret so it can be
 * revoked simply by rotating `NEXTAUTH_SECRET`.
 */
/**
 * Signs a per-user ICS subscription token.
 *
 * `rotation` is an integer stored on the user that the owner can bump (via
 * `me.rotateCalendarToken`) to revoke any previously-shared URL. Older code
 * paths can call without `rotation` for backwards compatibility — those
 * default to `0` so existing subscriptions keep working until rotation is
 * explicitly invoked.
 */
export function signCalendarToken(
  userId: string,
  secret: string,
  rotation = 0,
): string {
  return createHmac("sha256", secret)
    .update(`ical:${userId}:${rotation}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyCalendarToken(
  userId: string,
  token: string,
  secret: string,
  rotation = 0,
): boolean {
  const expected = signCalendarToken(userId, secret, rotation);
  // Constant-time-ish comparison
  if (expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Stable UID for a shift event, embeds the business hash for uniqueness. */
export function buildEventUid(shiftId: string, businessId: string): string {
  const businessHash = createHash("sha1")
    .update(businessId)
    .digest("hex")
    .slice(0, 8);
  return `${shiftId}-${businessHash}@tattoogenda`;
}
