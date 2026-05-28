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

const PRESET_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#0ea5e9",
];

export function SkillsClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const skillsQuery = trpc.skill.list.useQuery();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const createSkill = trpc.skill.create.useMutation({
    onSuccess: () => {
      utils.skill.list.invalidate();
      setName("");
      toast.success(t("toast.skillSaved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const deleteSkill = trpc.skill.delete.useMutation({
    onSuccess: () => {
      utils.skill.list.invalidate();
      toast.success(t("toast.skillRemoved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("skills.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("skills.subtitle")}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createSkill.mutate({ name, color });
          }}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex-1 min-w-[180px]">
            <Label htmlFor="skill-name">{t("skills.name")}</Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </div>
          <div>
            <Label>{t("skills.color")}</Label>
            <div className="mt-1 flex gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={`h-7 w-7 rounded-full border-2 ${
                    color === c ? "border-slate-900" : "border-transparent"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <Button type="submit" disabled={createSkill.isPending}>
            <Plus className="mr-1 h-4 w-4" />
            {t("skills.add")}
          </Button>
        </form>

        <section className="mt-6">
          {skillsQuery.isLoading && (
            <p className="text-sm text-slate-500">{t("hours.loading")}</p>
          )}
          {skillsQuery.data && skillsQuery.data.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              {t("skills.empty")}
            </p>
          )}
          <ul className="space-y-2">
            {(skillsQuery.data ?? []).map((skill) => (
              <li
                key={skill.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: skill.color }}
                    aria-hidden
                  />
                  <span className="font-medium text-slate-900">
                    {skill.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t("skills.workerCount", { count: skill._count.workers })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteSkill.mutate({ id: skill.id })}
                  disabled={deleteSkill.isPending}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
