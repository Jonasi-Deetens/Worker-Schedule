"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Play, Square } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import { formatTimeRange } from "@/lib/calendar-utils";
import { ContractSigningPanel } from "@/interface/components/contract-signing-panel";

export function ClockClient({ initialShiftId }: { initialShiftId: string | null }) {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const active = trpc.timeClock.active.useQuery();
  const dashboard = trpc.me.dashboard.useQuery();
  const pendingContracts = trpc.contract.listPendingMine.useQuery();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [breakMinutes, setBreakMinutes] = useState(0);
  const [notes, setNotes] = useState("");

  const clockIn = trpc.timeClock.clockIn.useMutation({
    onSuccess: () => {
      utils.timeClock.active.invalidate();
      toast.success(t("toast.clockedIn"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const clockOut = trpc.timeClock.clockOut.useMutation({
    onSuccess: () => {
      utils.timeClock.active.invalidate();
      setNotes("");
      setBreakMinutes(0);
      toast.success(t("toast.clockedOut"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const entry = active.data;
  const runningMinutes = entry?.clockInAt
    ? Math.round((now - new Date(entry.clockInAt).getTime()) / 60000)
    : 0;

  // The shift we offer to clock in against: the deep-linked one if it matches
  // the worker's next assignment, otherwise simply their next assignment.
  const nextShift = dashboard.data?.nextShift ?? null;
  const targetShift =
    nextShift && (!initialShiftId || nextShift.shiftId === initialShiftId)
      ? nextShift
      : null;
  const linkedShift = entry?.shift ?? null;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-md px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("clock.title")}</h1>

        <ContractSigningPanel />

        {(pendingContracts.data?.length ?? 0) > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t("clock.contractRequiredHint")}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          {entry ? (
            <>
              <p className="text-sm text-slate-500">
                {t("clock.running", { minutes: runningMinutes })}
              </p>
              <p className="mt-1 text-3xl font-bold text-emerald-600">
                {new Date(entry.clockInAt).toLocaleTimeString()}
              </p>

              {linkedShift && (
                <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                  {t("clock.linkedShift", {
                    role: linkedShift.roleLabel,
                    window: formatTimeRange(
                      new Date(linkedShift.startsAt),
                      new Date(linkedShift.endsAt),
                    ),
                  })}
                </p>
              )}

              <div className="mt-4 grid grid-cols-1 gap-3 text-left">
                <div>
                  <Label htmlFor="breakMinutes">{t("clock.break")}</Label>
                  <Input
                    id="breakMinutes"
                    type="number"
                    min={0}
                    value={breakMinutes}
                    onChange={(e) => setBreakMinutes(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="notes">{t("clock.notes")}</Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={() =>
                  clockOut.mutate({
                    id: entry.id,
                    breakMinutes,
                    notes: notes || undefined,
                  })
                }
                disabled={clockOut.isPending}
                className="mt-6 h-14 w-full text-lg"
                variant="destructive"
              >
                <Square className="mr-2 h-5 w-5" />
                {t("clock.clockOut")}
              </Button>
            </>
          ) : (
            <>
              {targetShift ? (
                <>
                  <p className="text-sm text-slate-500">
                    {t("clock.forShift")}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {targetShift.roleLabel}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatTimeRange(
                      new Date(targetShift.startsAt),
                      new Date(targetShift.endsAt),
                    )}
                  </p>
                  <Button
                    onClick={() =>
                      clockIn.mutate({ shiftId: targetShift.shiftId })
                    }
                    disabled={clockIn.isPending}
                    className="mt-6 h-14 w-full text-lg"
                  >
                    <Play className="mr-2 h-5 w-5" />
                    {t("clock.clockInForShift")}
                  </Button>
                  <button
                    type="button"
                    onClick={() => clockIn.mutate({})}
                    disabled={clockIn.isPending}
                    className="mt-3 text-sm text-slate-500 underline hover:text-slate-700"
                  >
                    {t("clock.clockInPlain")}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-500">
                    {t("clock.noActiveShift")}
                  </p>
                  <Button
                    onClick={() => clockIn.mutate({})}
                    disabled={clockIn.isPending}
                    className="mt-6 h-14 w-full text-lg"
                  >
                    <Play className="mr-2 h-5 w-5" />
                    {t("clock.clockIn")}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
