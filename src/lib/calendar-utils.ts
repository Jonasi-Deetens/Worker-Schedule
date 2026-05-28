import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export function getMonthGrid(referenceDate: Date) {
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

export function formatTimeRange(startsAt: Date, endsAt: Date) {
  return `${format(startsAt, "HH:mm")}–${format(endsAt, "HH:mm")}`;
}

export function formatDayKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export { addMonths, endOfMonth, format, isSameDay, isSameMonth, startOfMonth };
