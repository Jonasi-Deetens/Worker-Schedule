"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

interface TemplateRow {
  id: string;
  name: string;
  roleLabel: string;
  requiredSpots: number;
  defaultStart: string;
  defaultEnd: string;
  notes: string | null;
}

export function TemplatesClient() {
  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.template.list.useQuery();
  const [draftOpen, setDraftOpen] = useState(false);

  const createTemplate = trpc.template.create.useMutation({
    onSuccess: () => {
      utils.template.list.invalidate();
      setDraftOpen(false);
      toast.success("Template created");
    },
    onError: (e) => toast.error(trpcErrorMessage(e, (k) => k)),
  });

  const deleteTemplate = trpc.template.delete.useMutation({
    onSuccess: () => {
      utils.template.list.invalidate();
      toast.success("Template removed");
    },
    onError: (e) => toast.error(trpcErrorMessage(e, (k) => k)),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createTemplate.mutate({
      name: String(form.get("name")),
      roleLabel: String(form.get("roleLabel")),
      requiredSpots: Number(form.get("requiredSpots")),
      defaultStart: String(form.get("defaultStart")),
      defaultEnd: String(form.get("defaultEnd")),
      notes: (form.get("notes") as string) || undefined,
    });
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Shift templates</h1>
            <p className="mt-1 text-sm text-slate-600">
              Reusable presets to speed up new shift creation.
            </p>
          </div>
          <Button size="sm" onClick={() => setDraftOpen((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" />
            {draftOpen ? "Cancel" : "New template"}
          </Button>
        </div>

        {draftOpen && (
          <form
            onSubmit={handleCreate}
            className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div>
                <Label htmlFor="roleLabel">Role</Label>
                <Input id="roleLabel" name="roleLabel" required />
              </div>
              <div>
                <Label htmlFor="defaultStart">Default start</Label>
                <Input
                  id="defaultStart"
                  name="defaultStart"
                  type="time"
                  required
                />
              </div>
              <div>
                <Label htmlFor="defaultEnd">Default end</Label>
                <Input
                  id="defaultEnd"
                  name="defaultEnd"
                  type="time"
                  required
                />
              </div>
              <div>
                <Label htmlFor="requiredSpots">Required spots</Label>
                <Input
                  id="requiredSpots"
                  name="requiredSpots"
                  type="number"
                  min={1}
                  defaultValue={1}
                  required
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={createTemplate.isPending}>
                Save template
              </Button>
            </div>
          </form>
        )}

        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

        {!isLoading && templates?.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No templates yet.
          </p>
        )}

        {templates && templates.length > 0 && (
          <ul className="space-y-2">
            {(templates as TemplateRow[]).map((tpl) => (
              <li
                key={tpl.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="font-medium text-slate-900">{tpl.name}</p>
                  <p className="text-xs text-slate-500">
                    {tpl.roleLabel} · {tpl.defaultStart}–{tpl.defaultEnd} ·{" "}
                    {tpl.requiredSpots} spots
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete template"
                  onClick={() => deleteTemplate.mutate({ id: tpl.id })}
                  disabled={deleteTemplate.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
