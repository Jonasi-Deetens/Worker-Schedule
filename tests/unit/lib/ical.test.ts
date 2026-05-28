import { describe, expect, it } from "vitest";
import {
  buildEventUid,
  buildIcal,
  formatIcalDate,
  signCalendarToken,
  verifyCalendarToken,
} from "@/lib/ical";

describe("signCalendarToken rotation", () => {
  it("produces a different token after rotation, invalidating the previous", () => {
    const secret = "s".repeat(32);
    const before = signCalendarToken("user-1", secret, 0);
    const after = signCalendarToken("user-1", secret, 1);
    expect(before).not.toBe(after);
    expect(verifyCalendarToken("user-1", before, secret, 1)).toBe(false);
    expect(verifyCalendarToken("user-1", after, secret, 1)).toBe(true);
  });

  it("stays backwards compatible when rotation is omitted", () => {
    const secret = "s".repeat(32);
    const a = signCalendarToken("user-1", secret);
    const b = signCalendarToken("user-1", secret, 0);
    expect(a).toBe(b);
  });
});

describe("formatIcalDate", () => {
  it("produces YYYYMMDDTHHmmssZ format in UTC", () => {
    expect(formatIcalDate(new Date("2026-06-01T09:30:00Z"))).toBe(
      "20260601T093000Z",
    );
  });
});

describe("buildIcal", () => {
  const event = {
    uid: "shift-1@tg",
    summary: "Bartender, Friday",
    description: "Bring keys",
    startsAt: new Date("2026-06-01T09:30:00Z"),
    endsAt: new Date("2026-06-01T17:00:00Z"),
  };

  it("wraps events in a VCALENDAR document", () => {
    const out = buildIcal({ events: [event], calendarName: "Cal" });
    expect(out).toContain("BEGIN:VCALENDAR");
    expect(out).toContain("END:VCALENDAR");
    expect(out).toContain("BEGIN:VEVENT");
    expect(out).toContain("END:VEVENT");
    expect(out).toContain("UID:shift-1@tg");
    expect(out).toContain("DTSTART:20260601T093000Z");
    expect(out).toContain("SUMMARY:Bartender\\, Friday");
  });

  it("escapes commas, semicolons and newlines in text fields", () => {
    const out = buildIcal({
      events: [
        {
          ...event,
          summary: "A, B; C",
          description: "line1\nline2",
        },
      ],
      calendarName: "Cal",
    });
    expect(out).toContain("SUMMARY:A\\, B\\; C");
    expect(out).toContain("DESCRIPTION:line1\\nline2");
  });
});

describe("calendar token", () => {
  it("verifies tokens it signs", () => {
    const token = signCalendarToken("user-1", "secret");
    expect(verifyCalendarToken("user-1", token, "secret")).toBe(true);
  });

  it("rejects tokens signed with another secret", () => {
    const token = signCalendarToken("user-1", "secret");
    expect(verifyCalendarToken("user-1", token, "other")).toBe(false);
  });

  it("rejects tokens for a different user id", () => {
    const token = signCalendarToken("user-1", "secret");
    expect(verifyCalendarToken("user-2", token, "secret")).toBe(false);
  });

  it("rejects tampered tokens of correct length", () => {
    const token = signCalendarToken("user-1", "secret");
    const tampered = token.replace(token[0]!, token[0] === "a" ? "b" : "a");
    expect(verifyCalendarToken("user-1", tampered, "secret")).toBe(false);
  });
});

describe("buildEventUid", () => {
  it("is deterministic and includes the shift id", () => {
    const a = buildEventUid("shift-1", "biz-1");
    const b = buildEventUid("shift-1", "biz-1");
    expect(a).toBe(b);
    expect(a).toContain("shift-1");
    expect(a.endsWith("@work-calendar")).toBe(true);
  });
});
