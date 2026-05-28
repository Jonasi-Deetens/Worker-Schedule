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

export function ClockClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const active = trpc.timeClock.active.useQuery();

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

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-md px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("clock.title")}</h1>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          {entry ? (
            <>
              <p className="text-sm text-slate-500">
                {t("clock.running", { minutes: runningMinutes })}
              </p>
              <p className="mt-1 text-3xl font-bold text-emerald-600">
                {new Date(entry.clockInAt).toLocaleTimeString()}
              </p>

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
              <p className="text-sm text-slate-500">{t("clock.noActiveShift")}</p>
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
        </div>
      </main>
    </div>
  );
}
