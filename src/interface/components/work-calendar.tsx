"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DateSelectArg,
  DatesSetArg,
  EventChangeArg,
  EventClickArg,
  EventContentArg,
} from "@fullcalendar/core";
import {
  CalendarClock,
  CalendarX,
  CheckCircle2,
  Clock4,
  Hourglass,
  Loader2,
  XCircle,
} from "lucide-react";
import { useMemo, useRef, type ComponentType } from "react";
import type { DisplayStatus } from "@/domain/types";
import type { CalendarEvent } from "@/lib/calendar-events";
import { calendarEventSurface } from "@/lib/status-colors";
import { AvatarStack } from "./avatar";

export interface CalendarRangeChange {
  start: Date;
  end: Date;
}

export interface EventReschedule {
  eventId: string;
  shiftId: string;
  newStart: Date;
  newEnd: Date;
  revert: () => void;
}

export type CalendarTimeFormat = "24h" | "12h";

interface WorkCalendarProps {
  events: CalendarEvent[];
  initialView?: "dayGridMonth" | "timeGridWeek" | "timeGridDay";
  onEventClick?: (event: CalendarEvent) => void;
  onDateSelect?: (selection: { start: Date; end: Date; allDay: boolean }) => void;
  onRangeChange?: (range: CalendarRangeChange) => void;
  onEventReschedule?: (change: EventReschedule) => void;
  isLoading?: boolean;
  isError?: boolean;
  errorTitle?: string;
  retryLabel?: string;
  onRetry?: () => void;
  emptyLabel?: string;
  canSelect?: boolean;
  editable?: boolean;
  ariaLabel?: string;
  /** "24h" = 13:00, "12h" = 1:00 PM. Defaults to "24h". */
  timeFormat?: CalendarTimeFormat;
  /** Shift ids highlighted as selected (used by the bulk-reschedule flow). */
  selectedShiftIds?: ReadonlySet<string>;
}

const STATUS_CLASS: Record<DisplayStatus | "Available", string> = {
  Open: "tg-event tg-event-open",
  Pending: "tg-event tg-event-pending",
  "Approved/Filled": "tg-event tg-event-approved",
  Rejected: "tg-event tg-event-rejected",
  Withdrawn: "tg-event tg-event-withdrawn",
  Cancelled: "tg-event tg-event-cancelled",
  Available: "tg-event tg-event-availability",
};

const STATUS_ICON: Record<DisplayStatus | "Available", ComponentType<{ className?: string }>> = {
  Open: CalendarClock,
  Pending: Hourglass,
  "Approved/Filled": CheckCircle2,
  Rejected: XCircle,
  Withdrawn: Clock4,
  Cancelled: CalendarX,
  Available: Clock4,
};

function buildTimeFormat(fmt: CalendarTimeFormat) {
  return {
    hour: "2-digit" as const,
    minute: "2-digit" as const,
    meridiem: fmt === "12h" ? ("short" as const) : (false as const),
    hour12: fmt === "12h",
  };
}

function formatTime(date: Date | null, fmt: CalendarTimeFormat): string {
  if (!date) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: fmt === "12h",
  });
}

function makeRenderEventContent(fmt: CalendarTimeFormat) {
  return function renderEventContent(arg: EventContentArg) {
  const props = arg.event.extendedProps as CalendarEvent["extendedProps"];
  const status = (props.status ?? "Open") as DisplayStatus | "Available";
  const Icon = STATUS_ICON[status] ?? CalendarClock;

  const start = formatTime(arg.event.start, fmt);
  const end = formatTime(arg.event.end, fmt);

  const required = props.requiredSpots ?? 0;
  const approved = props.approvedCount ?? 0;

  const isShift = props.kind === "shift";
  const titleText = isShift
    ? (props.roleLabel ?? arg.event.title)
    : arg.event.title;

  const surface = calendarEventSurface(status);

  return (
    <div
      className="tg-event-body"
      style={
        {
          "--tg-accent": surface.accent,
          "--tg-fill": surface.fill,
          "--tg-text": surface.text,
          "--tg-text-hover": surface.textHover,
        } as React.CSSProperties
      }
      aria-label={`${titleText}, ${status}`}
    >
      <div className="tg-event-head">
        <Icon className="tg-event-icon" aria-hidden />
        <span className="tg-event-title">{titleText}</span>
        {isShift && required > 0 && (
          <span className="tg-event-count">
            {approved}/{required}
          </span>
        )}
      </div>
      <div className="tg-event-meta">
        <span>{start}{end && `–${end}`}</span>
        {props.subscriptionStatus && (
          <span className="tg-event-substatus">{props.subscriptionStatus}</span>
        )}
      </div>
      {isShift && props.assignees && props.assignees.length > 0 && (
        <div className="tg-event-avatars" aria-hidden>
          <AvatarStack
            people={props.assignees}
            size="xs"
            max={4}
            ringColor={surface.accent}
          />
        </div>
      )}
      <span className="sr-only">Status: {status}</span>
    </div>
  );
  };
}

/**
 * Wraps FullCalendar with a Bryntum-flavored visual treatment and the
 * cross-cutting plumbing the page expects:
 *
 *  - Loading / empty / error overlays so callers don't have to re-render around it
 *  - Range change broadcast via `onRangeChange` so the page can sync queries
 *  - Optional drag-create (`onDateSelect`) and drag-reschedule (`onEventReschedule`)
 */
export function WorkCalendar({
  events,
  initialView = "timeGridWeek",
  onEventClick,
  onDateSelect,
  onRangeChange,
  onEventReschedule,
  isLoading = false,
  isError = false,
  errorTitle,
  retryLabel,
  onRetry,
  emptyLabel,
  canSelect = false,
  editable = false,
  ariaLabel,
  timeFormat = "24h",
  selectedShiftIds,
}: WorkCalendarProps) {
  const fcRef = useRef<FullCalendar | null>(null);
  const tf = buildTimeFormat(timeFormat);
  const renderEventContent = useMemo(
    () => makeRenderEventContent(timeFormat),
    [timeFormat],
  );

  const fcEvents = useMemo(
    () =>
      events.map((e) => {
        const isSelected =
          e.extendedProps.kind === "shift" &&
          !!e.extendedProps.shiftId &&
          !!selectedShiftIds?.has(e.extendedProps.shiftId);
        return {
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          editable: editable && e.extendedProps.kind === "shift",
          classNames: [
            STATUS_CLASS[e.extendedProps.status] ?? "tg-event tg-event-open",
            ...(isSelected ? ["tg-event-selected"] : []),
          ],
          extendedProps: e.extendedProps,
        };
      }),
    [events, editable, selectedShiftIds],
  );

  const handleEventClick = (arg: EventClickArg) => {
    if (!onEventClick) return;
    const id = arg.event.id;
    const original = events.find((e) => e.id === id);
    if (original) onEventClick(original);
  };

  const handleSelect = (arg: DateSelectArg) => {
    if (!onDateSelect) return;
    onDateSelect({ start: arg.start, end: arg.end, allDay: arg.allDay });
    arg.view.calendar.unselect();
  };

  const handleDatesSet = (arg: DatesSetArg) => {
    if (!onRangeChange) return;
    onRangeChange({ start: arg.start, end: arg.end });
  };

  const handleEventChange = (arg: EventChangeArg) => {
    if (!onEventReschedule) return;
    const props = arg.event.extendedProps as CalendarEvent["extendedProps"];
    if (props.kind !== "shift" || !props.shiftId) {
      arg.revert();
      return;
    }
    if (!arg.event.start || !arg.event.end) {
      arg.revert();
      return;
    }
    onEventReschedule({
      eventId: arg.event.id,
      shiftId: props.shiftId,
      newStart: arg.event.start,
      newEnd: arg.event.end,
      revert: () => arg.revert(),
    });
  };

  const showEmpty = !isLoading && !isError && events.length === 0;

  return (
    <div
      className="tg-calendar-shell relative"
      role="region"
      aria-label={ariaLabel ?? "Calendar"}
    >
      <FullCalendar
        ref={fcRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={initialView}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        height="auto"
        firstDay={1}
        nowIndicator
        weekends
        weekNumbers={false}
        selectable={canSelect}
        selectMirror={canSelect}
        select={canSelect ? handleSelect : undefined}
        editable={editable}
        eventResizableFromStart={editable}
        eventStartEditable={editable}
        eventDurationEditable={editable}
        eventChange={editable ? handleEventChange : undefined}
        datesSet={handleDatesSet}
        dayMaxEventRows={4}
        eventClick={handleEventClick}
        eventContent={renderEventContent}
        events={fcEvents}
        eventTimeFormat={tf}
        slotMinTime="06:00:00"
        slotMaxTime="24:00:00"
        slotDuration="00:30:00"
        slotLabelInterval="01:00:00"
        slotLabelFormat={tf}
        expandRows
        scrollTime="08:00:00"
        eventDisplay="block"
        displayEventEnd
        allDaySlot={false}
      />

      {isLoading && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            <span>Loading…</span>
          </div>
        </div>
      )}

      {isError && (
        <div
          className="absolute inset-x-0 top-16 z-10 mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700 shadow-sm"
          role="alert"
        >
          <p className="font-medium">{errorTitle ?? "Could not load the calendar."}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex h-8 items-center rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              {retryLabel ?? "Retry"}
            </button>
          )}
        </div>
      )}

      {showEmpty && emptyLabel && (
        <div
          className="pointer-events-none absolute inset-x-0 top-24 z-0 mx-auto max-w-md text-center text-xs text-slate-400"
          aria-live="polite"
        >
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
