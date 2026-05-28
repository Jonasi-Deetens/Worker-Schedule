"use client";

import { useMemo } from "react";
import { formatTimeRange } from "@/lib/calendar-utils";

interface PlannerShift {
  id: string;
  startsAt: Date | string;
  endsAt: Date | string;
  roleLabel: string;
  assignments?: Array<{ userId: string }>;
}

interface PlannerWorker {
  id: string;
  name: string;
}

interface PlannerGridProps {
  weekStart: Date;
  workers: ReadonlyArray<PlannerWorker>;
  shifts: ReadonlyArray<PlannerShift>;
  onAssign?: (shiftId: string, workerId: string) => void;
}

/**
 * Planner Grid: a workers × days matrix the owner can use as an alternative
 * to the calendar view. Each shift renders in its day column, listing the
 * already-assigned workers. The row header lets you drag a worker chip onto
 * any shift cell to call `onAssign`.
 *
 * Drag-and-drop uses the native HTML5 API with `text/plain` carrying the
 * worker id so it works without an extra dependency.
 */
export function PlannerGrid({
  weekStart,
  workers,
  shifts,
  onAssign,
}: PlannerGridProps) {
  const days = useMemo(() => {
    const out: Date[] = [];
    const start = new Date(weekStart);
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    return out;
  }, [weekStart]);

  const shiftsByDay = useMemo(() => {
    const m = new Map<string, PlannerShift[]>();
    for (const shift of shifts) {
      const key = new Date(shift.startsAt).toDateString();
      const list = m.get(key) ?? [];
      list.push(shift);
      m.set(key, list);
    }
    return m;
  }, [shifts]);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[800px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="border-b border-slate-200 p-3">Worker</th>
            {days.map((day) => (
              <th key={day.toISOString()} className="border-b border-slate-200 p-3">
                {day.toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </th>
            ))}
          </tr>
          <tr>
            <th className="border-b border-slate-200 p-3 font-medium text-slate-700">
              Open shifts
            </th>
            {days.map((day) => {
              const list = shiftsByDay.get(day.toDateString()) ?? [];
              return (
                <td
                  key={day.toISOString()}
                  className="border-b border-slate-200 p-2 align-top"
                >
                  {list.map((shift) => (
                    <div
                      key={shift.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const workerId = e.dataTransfer.getData("text/plain");
                        if (workerId && onAssign) onAssign(shift.id, workerId);
                      }}
                      className="mb-1 rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-2"
                    >
                      <div className="text-xs font-medium text-slate-800">
                        {shift.roleLabel}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {formatTimeRange(
                          new Date(shift.startsAt),
                          new Date(shift.endsAt),
                        )}
                      </div>
                      {shift.assignments && shift.assignments.length > 0 && (
                        <div className="mt-1 text-[10px] text-emerald-600">
                          {shift.assignments.length} assigned
                        </div>
                      )}
                    </div>
                  ))}
                  {list.length === 0 && (
                    <div className="text-[10px] text-slate-400">—</div>
                  )}
                </td>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {workers.map((worker) => (
            <tr key={worker.id} className="border-t border-slate-100">
              <th
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", worker.id);
                  e.dataTransfer.effectAllowed = "copyMove";
                }}
                className="cursor-grab whitespace-nowrap p-3 text-left font-medium text-slate-800"
              >
                {worker.name}
              </th>
              {days.map((day) => {
                const list = shiftsByDay.get(day.toDateString()) ?? [];
                const assigned = list.filter((s) =>
                  s.assignments?.some((a) => a.userId === worker.id),
                );
                return (
                  <td
                    key={day.toISOString()}
                    className="p-2 align-top text-xs text-slate-600"
                  >
                    {assigned.map((s) => (
                      <div
                        key={s.id}
                        className="mb-1 rounded bg-emerald-50 px-2 py-1 text-emerald-800"
                      >
                        {s.roleLabel}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
