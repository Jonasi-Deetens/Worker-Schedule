"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Mail, Plus, UserMinus, UserPlus, UserX } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

export function WorkersClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const workersQuery = trpc.worker.list.useQuery();
  const invitesQuery = trpc.invite.list.useQuery();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const createInvite = trpc.invite.create.useMutation({
    onSuccess: (data) => {
      utils.invite.list.invalidate();
      setInviteEmail("");
      const url = (data as { acceptUrl?: string } | undefined)?.acceptUrl ?? null;
      setLastLink(url);
      toast.success(t("toast.inviteSent"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const revokeInvite = trpc.invite.revoke.useMutation({
    onSuccess: () => {
      utils.invite.list.invalidate();
      toast.success(t("toast.inviteRevoked"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const setStatus = trpc.worker.setStatus.useMutation({
    onSuccess: () => {
      utils.worker.list.invalidate();
      toast.success(t("toast.workerUpdated"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("invite.linkCopied"));
    } catch {
      // ignore
    }
  };

  const workers = workersQuery.data ?? [];

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t("workers.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-600">{t("workers.subtitle")}</p>
          </div>
          <Button onClick={() => setInviteOpen((v) => !v)} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            {t("workers.inviteCta")}
          </Button>
        </div>

        {inviteOpen && (
          <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              {t("workers.inviteCta")}
            </h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="invite-email">{t("auth.email")}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="worker@example.com"
                />
              </div>
              <Button
                onClick={() =>
                  createInvite.mutate({
                    email: inviteEmail || undefined,
                    role: "WORKER",
                  })
                }
                disabled={createInvite.isPending}
              >
                <Mail className="mr-1 h-4 w-4" />
                {t("invite.sendEmail")}
              </Button>
            </div>
            {lastLink && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                <span className="flex-1 truncate font-mono text-xs text-slate-700">
                  {lastLink}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(lastLink)}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  {t("invite.copyLink")}
                </Button>
              </div>
            )}
          </section>
        )}

        {invitesQuery.data && invitesQuery.data.length > 0 && (
          <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-amber-900">
              Pending invites
            </h2>
            <ul className="space-y-2">
              {invitesQuery.data.map((invite) => {
                const acceptUrl = `${window.location.origin}/invite/${invite.token}`;
                return (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        {invite.email ?? "(no email)"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t("invite.expiresAt", {
                          date: new Date(invite.expiresAt).toLocaleDateString(),
                        })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(acceptUrl)}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        {t("invite.copyLink")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeInvite.mutate({ id: invite.id })}
                        disabled={revokeInvite.isPending}
                      >
                        <UserX className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {workersQuery.isLoading ? (
          <p className="text-sm text-slate-500">{t("hours.loading")}</p>
        ) : workers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            {t("workers.empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {workers.map((worker) => (
              <li
                key={worker.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/workers/${worker.id}`}
                      className="text-sm font-semibold text-slate-900 hover:underline"
                    >
                      {worker.name}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(worker.status)}`}
                    >
                      {t(`workers.${worker.status.toLowerCase()}`)}
                    </span>
                    {worker.contractType && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {worker.contractType}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{worker.email}</p>
                  {worker.skills.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {worker.skills.map(({ skill }) => (
                        <span
                          key={skill.id}
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{
                            background: `${skill.color}22`,
                            color: skill.color,
                          }}
                        >
                          {skill.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {worker.status === "ACTIVE" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setStatus.mutate({ id: worker.id, status: "SUSPENDED" })
                      }
                      title={t("workers.suspend")}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setStatus.mutate({ id: worker.id, status: "ACTIVE" })
                      }
                      title={t("workers.reactivate")}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-100 text-emerald-800";
    case "SUSPENDED":
      return "bg-amber-100 text-amber-800";
    case "ARCHIVED":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
