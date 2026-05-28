"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";

export function MyDataClient() {
  const exportMutation = trpc.gdpr.exportMine.useQuery(undefined, {
    enabled: false,
  });
  const deleteMutation = trpc.gdpr.deleteMine.useMutation({
    onSuccess: (res) => {
      const count =
        typeof res === "object" && res && "deletedAssignments" in res
          ? (res as { deletedAssignments: number }).deletedAssignments
          : 0;
      toast.success(
        `Account scheduled for deletion. ${count} future assignment(s) removed.`,
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const [confirmDelete, setConfirmDelete] = useState("");

  async function handleDownload() {
    const res = await exportMutation.refetch();
    if (!res.data) return;
    const blob = new Blob([JSON.stringify(res.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tattoogenda-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold text-slate-900">Your data</h1>
      <p className="mt-2 text-sm text-slate-600">
        Under GDPR you can export everything we hold about you and delete your
        account at any time.
      </p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Export</h2>
        <p className="mt-1 text-sm text-slate-600">
          Downloads a JSON file with your profile, availabilities, applications,
          assignments and notifications. Sensitive credentials are excluded.
        </p>
        <div className="mt-3">
          <Button onClick={handleDownload} disabled={exportMutation.isFetching}>
            {exportMutation.isFetching ? "Preparing…" : "Download my data"}
          </Button>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4">
        <h2 className="text-lg font-semibold text-red-900">Delete account</h2>
        <p className="mt-1 text-sm text-red-800">
          Your account is suspended immediately and permanently removed after 90
          days. Future shift assignments are cancelled. Past records (and
          legally-required payroll history) are kept.
        </p>
        <label className="mt-3 block text-sm text-red-900">
          Type <span className="font-mono font-semibold">DELETE</span> to
          confirm
          <input
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
            className="mt-1 w-full rounded-lg border border-red-300 bg-white px-3 py-2"
          />
        </label>
        <div className="mt-3">
          <Button
            variant="destructive"
            disabled={confirmDelete !== "DELETE" || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            Delete my account
          </Button>
        </div>
      </section>
    </main>
  );
}
