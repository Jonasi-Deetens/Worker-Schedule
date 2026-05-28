import { describe, expect, it } from "vitest";
import {
  availabilityToCalendarEvent,
  buildCalendarEvents,
  filterCalendarEvents,
  resolveShiftDisplayStatus,
  shiftToCalendarEvent,
  type CalendarShift,
} from "@/lib/calendar-events";

const baseShift: CalendarShift = {
  id: "shift-1",
  startsAt: new Date("2026-06-01T10:00:00Z"),
  endsAt: new Date("2026-06-01T18:00:00Z"),
  roleLabel: "Barista",
  status: "OPEN",
  requiredSpots: 2,
  _count: { subscriptions: 0, assignments: 0 },
};

describe("resolveShiftDisplayStatus", () => {
  it("returns Open when no subscriptions and no assignments", () => {
    expect(resolveShiftDisplayStatus(baseShift, "OWNER")).toBe("Open");
  });

  it("returns Pending when pending count > 0 and not filled", () => {
    expect(
      resolveShiftDisplayStatus(
        { ...baseShift, _count: { subscriptions: 1, assignments: 0 } },
        "OWNER",
      ),
    ).toBe("Pending");
  });

  it("returns Approved/Filled when assignments meet capacity", () => {
    expect(
      resolveShiftDisplayStatus(
        { ...baseShift, _count: { subscriptions: 0, assignments: 2 } },
        "OWNER",
      ),
    ).toBe("Approved/Filled");
  });

  it("returns Cancelled when shift is cancelled regardless of counts", () => {
    expect(
      resolveShiftDisplayStatus({ ...baseShift, status: "CANCELLED" }, "OWNER"),
    ).toBe("Cancelled");
  });

  it("uses worker's own subscription status when viewer is WORKER", () => {
    const shift: CalendarShift = {
      ...baseShift,
      subscriptions: [{ id: "sub-1", status: "PENDING" }],
    };
    expect(resolveShiftDisplayStatus(shift, "WORKER")).toBe("Pending");
    expect(resolveShiftDisplayStatus(shift, "OWNER")).toBe("Open");
  });
});

describe("shiftToCalendarEvent", () => {
  it("encodes role label and filled count in title for owners", () => {
    const event = shiftToCalendarEvent(
      { ...baseShift, _count: { subscriptions: 0, assignments: 1 } },
      "OWNER",
    );
    expect(event.title).toBe("Barista (1/2)");
    expect(event.extendedProps.kind).toBe("shift");
    expect(event.extendedProps.shiftId).toBe("shift-1");
    expect(event.id).toBe("shift:shift-1");
  });

  it("uses role label only for workers", () => {
    expect(shiftToCalendarEvent(baseShift, "WORKER").title).toBe("Barista");
  });

  it("maps status to a hex color triple compatible with FullCalendar", () => {
    const open = shiftToCalendarEvent(baseShift, "OWNER");
    expect(open.backgroundColor).toMatch(/^#/);
    expect(open.borderColor).toMatch(/^#/);
    expect(open.textColor).toMatch(/^#/);
  });

  it("exposes assignees on the event so the avatar stack can render", () => {
    const event = shiftToCalendarEvent(
      {
        ...baseShift,
        assignments: [
          { userId: "u1", user: { id: "u1", name: "Ada", avatarUrl: "https://x/a.jpg" } },
          { userId: "u2", user: { id: "u2", name: "Ben", avatarUrl: null } },
        ],
        _count: { subscriptions: 0, assignments: 2 },
      },
      "OWNER",
    );
    expect(event.extendedProps.assignees).toEqual([
      { id: "u1", name: "Ada", avatarUrl: "https://x/a.jpg" },
      { id: "u2", name: "Ben", avatarUrl: null },
    ]);
  });

  it("returns an empty assignees array when nothing is approved yet", () => {
    const event = shiftToCalendarEvent(baseShift, "OWNER");
    expect(event.extendedProps.assignees).toEqual([]);
  });
});

describe("availabilityToCalendarEvent", () => {
  it("returns a violet-tinted event marked as availability", () => {
    const event = availabilityToCalendarEvent(
      {
        id: "av-1",
        startsAt: new Date("2026-06-01T09:00:00Z"),
        endsAt: new Date("2026-06-01T17:00:00Z"),
      },
      "Available",
    );
    expect(event.id).toBe("availability:av-1");
    expect(event.extendedProps.kind).toBe("availability");
    expect(event.title).toBe("Available");
  });

  it("exposes the raw availabilityId for click-to-edit flows", () => {
    const event = availabilityToCalendarEvent(
      {
        id: "av-42",
        startsAt: new Date("2026-06-01T09:00:00Z"),
        endsAt: new Date("2026-06-01T17:00:00Z"),
      },
      "Available",
    );
    expect(event.extendedProps.availabilityId).toBe("av-42");
    expect(event.extendedProps.startsAt).toBeTruthy();
    expect(event.extendedProps.endsAt).toBeTruthy();
  });
});

describe("buildCalendarEvents", () => {
  it("concatenates shift and availability events", () => {
    const events = buildCalendarEvents({
      viewer: "WORKER",
      shifts: [baseShift],
      availabilities: [
        {
          id: "av-1",
          startsAt: new Date("2026-06-02T09:00:00Z"),
          endsAt: new Date("2026-06-02T17:00:00Z"),
        },
      ],
    });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.extendedProps.kind)).toEqual([
      "shift",
      "availability",
    ]);
  });
});

describe("filterCalendarEvents", () => {
  const shift = (overrides: Partial<CalendarShift> = {}) => ({
    ...baseShift,
    ...overrides,
  });

  it("returns all events when filters are empty", () => {
    const events = buildCalendarEvents({
      viewer: "OWNER",
      shifts: [shift({ id: "a", roleLabel: "Bartender" })],
    });
    expect(filterCalendarEvents(events, undefined)).toHaveLength(1);
    expect(filterCalendarEvents(events, {})).toHaveLength(1);
  });

  it("filters by role label case-insensitively", () => {
    const events = buildCalendarEvents({
      viewer: "OWNER",
      shifts: [
        shift({ id: "a", roleLabel: "Bartender" }),
        shift({ id: "b", roleLabel: "Waiter" }),
      ],
    });
    expect(filterCalendarEvents(events, { role: "bartender" })).toHaveLength(1);
  });

  it("filters by status set", () => {
    const events = buildCalendarEvents({
      viewer: "OWNER",
      shifts: [
        shift({
          id: "a",
          _count: { subscriptions: 0, assignments: 2 }, // Filled
        }),
        shift({ id: "b" }), // Open
      ],
    });
    const filtered = filterCalendarEvents(events, { statuses: ["Open"] });
    expect(filtered.map((e) => e.extendedProps.shiftId)).toEqual(["b"]);
  });

  it("filters owner view by worker id using the assignments map", () => {
    const events = buildCalendarEvents({
      viewer: "OWNER",
      shifts: [shift({ id: "a" }), shift({ id: "b" })],
    });
    const map = new Map<string, ReadonlyArray<string>>();
    map.set("a", ["worker-1"]);
    map.set("b", ["worker-2"]);
    const filtered = filterCalendarEvents(events, { workerId: "worker-2" }, map);
    expect(filtered.map((e) => e.extendedProps.shiftId)).toEqual(["b"]);
  });
});
