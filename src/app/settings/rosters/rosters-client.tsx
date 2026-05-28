"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

interface Slot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roleLabel: string;
  requiredSpots: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfWeekMon(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function RostersClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const list = trpc.roster.list.useQuery();
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [weekStart, setWeekStart] = useState(startOfWeekMon());

  const create = trpc.roster.create.useMutation({
    onSuccess: () => {
      utils.roster.list.invalidate();
      setName("");
      setSlots([]);
      toast.success(t("toast.templateSaved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const del = trpc.roster.delete.useMutation({
    onSuccess: () => utils.roster.list.invalidate(),
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const apply = trpc.roster.applyToWeek.useMutation({
    onSuccess: (data) => {
      const count = (data as { created?: number } | undefined)?.created ?? 0;
      toast.success(t("toast.rosterApplied"), {
        description: `${count}×`,
      });
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const addSlot = () =>
    setSlots((prev) => [
      ...prev,
      {
        dayOfWeek: 1,
        startTime: "17:00",
        endTime: "23:00",
        roleLabel: "Bartender",
        requiredSpots: 1,
      },
    ]);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("rosters.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("rosters.subtitle")}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name || slots.length === 0) return;
            create.mutate({ name, shifts: slots });
          }}
          className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="rosterName">{t("rosters.create")}</Label>
              <Input
                id="rosterName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("rosters.create")}
              />
            </div>
            <Button type="button" variant="outline" onClick={addSlot}>
              <Plus className="mr-1 h-4 w-4" />
              {t("rosters.addShift")}
            </Button>
          </div>

          {slots.length > 0 && (
            <ul className="space-y-2">
              {slots.map((slot, idx) => (
                <li
                  key={idx}
                  className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6"
                >
                  <select
                    value={slot.dayOfWeek}
                    onChange={(e) =>
                      setSlots((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx]!, dayOfWeek: Number(e.target.value) };
                        return next;
                      })
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                  >
                    {DAYS.map((d, i) => (
                      <option key={i} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) =>
                      setSlots((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx]!, startTime: e.target.value };
                        return next;
                      })
                    }
                  />
                  <Input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) =>
                      setSlots((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx]!, endTime: e.target.value };
                        return next;
                      })
                    }
                  />
                  <Input
                    value={slot.roleLabel}
                    onChange={(e) =>
                      setSlots((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx]!, roleLabel: e.target.value };
                        return next;
                      })
                    }
                  />
                  <Input
                    type="number"
                    min={1}
                    value={slot.requiredSpots}
                    onChange={(e) =>
                      setSlots((prev) => {
                        const next = [...prev];
                        next[idx] = {
                          ...next[idx]!,
                          requiredSpots: Math.max(1, Number(e.target.value)),
                        };
                        return next;
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSlots((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Button type="submit" disabled={create.isPending || slots.length === 0 || !name}>
            {t("rosters.create")}
          </Button>
        </form>

        <ul className="mt-6 space-y-2">
          {(list.data ?? []).map((roster) => (
            <li
              key={roster.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-medium text-slate-900">{roster.name}</p>
                <p className="text-xs text-slate-500">
                  {t("rosters.shiftCount", { count: roster._count.shifts })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  className="w-40"
                />
                <Button
                  size="sm"
                  onClick={() =>
                    apply.mutate({
                      rosterId: roster.id,
                      weekStart: new Date(weekStart + "T00:00:00"),
                    })
                  }
                  disabled={apply.isPending}
                >
                  {t("rosters.apply")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => del.mutate({ id: roster.id })}
                  disabled={del.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
          {list.data && list.data.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              {t("rosters.empty")}
            </p>
          )}
        </ul>
      </main>
    </div>
  );
}
