"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus } from "lucide-react";
import type { UserRole } from "@/domain/types";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

export function TimeOffClient({ role }: { role: UserRole }) {
  const t = useTranslations();
  const isOwner = role === "OWNER" || role === "MANAGER";
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("timeOff.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {isOwner ? t("timeOff.ownerSubtitle") : t("timeOff.workerSubtitle")}
        </p>
        {isOwner ? <OwnerView /> : <WorkerView />}
      </main>
    </div>
  );
}

function WorkerView() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const list = trpc.timeOff.listMine.useQuery();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);

  const submit = trpc.timeOff.request.useMutation({
    onSuccess: () => {
      utils.timeOff.listMine.invalidate();
      setFrom("");
      setTo("");
      setReason("");
      toast.success(t("toast.timeOffRequested"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const cancel = trpc.timeOff.cancel.useMutation({
    onSuccess: () => {
      utils.timeOff.listMine.invalidate();
      toast.success(t("toast.timeOffCancelled"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const update = trpc.timeOff.update.useMutation({
    onSuccess: () => {
      utils.timeOff.listMine.invalidate();
      setEditing(null);
      toast.success(t("toast.timeOffUpdated"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const grouped = groupTimeOff(list.data ?? []);
  const onCancel = (id: string) => cancel.mutate({ id });
  const onEdit = (item: Item) => setEditing(item);

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!from || !to) return;
          submit.mutate({
            startsAt: new Date(from + "T00:00:00"),
            endsAt: new Date(to + "T23:59:59"),
            reason: reason || undefined,
          });
        }}
        className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3"
      >
        <div>
          <Label htmlFor="from">{t("timeOff.from")}</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="to">{t("timeOff.to")}</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="reason">{t("timeOff.reason")}</Label>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <Button type="submit" size="sm" disabled={submit.isPending}>
            <Plus className="mr-1 h-4 w-4" />
            {t("timeOff.submit")}
          </Button>
        </div>
      </form>

      <Section
        title={t("timeOff.groupPending")}
        items={grouped.pending}
        onCancel={onCancel}
        onEdit={onEdit}
      />
      <Section
        title={t("timeOff.groupApproved")}
        items={grouped.approved}
        onCancel={onCancel}
        onEdit={onEdit}
      />
      <Section title={t("timeOff.groupRejected")} items={grouped.rejected} />
      {list.data && list.data.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {t("timeOff.empty")}
        </p>
      )}

      <EditDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSubmit={(payload) => update.mutate(payload)}
        isPending={update.isPending}
      />
    </>
  );
}

function OwnerView() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const list = trpc.timeOff.listForBusiness.useQuery({});
  const decide = trpc.timeOff.decide.useMutation({
    onSuccess: (_, vars) => {
      utils.timeOff.listForBusiness.invalidate();
      toast.success(
        vars.approve ? t("toast.timeOffApproved") : t("toast.timeOffRejected"),
      );
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });
  const revoke = trpc.timeOff.revoke.useMutation({
    onSuccess: () => {
      utils.timeOff.listForBusiness.invalidate();
      toast.success(t("toast.timeOffRevoked"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const grouped = groupTimeOff(list.data ?? []);

  return (
    <>
      <Section
        title={t("timeOff.groupPending")}
        items={grouped.pending}
        onApprove={(id) => decide.mutate({ id, approve: true })}
        onReject={(id) => decide.mutate({ id, approve: false })}
        showUser
      />
      <Section
        title={t("timeOff.groupApproved")}
        items={grouped.approved}
        onRevoke={(id) => revoke.mutate({ id })}
        showUser
      />
      <Section title={t("timeOff.groupRejected")} items={grouped.rejected} showUser />
      {list.data && list.data.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {t("timeOff.ownerEmpty")}
        </p>
      )}
    </>
  );
}

interface Item {
  id: string;
  startsAt: string | Date;
  endsAt: string | Date;
  reason: string | null;
  status: string;
  user?: { id: string; name: string; email: string };
}

function groupTimeOff(items: Item[]) {
  return {
    pending: items.filter((i) => i.status === "PENDING"),
    approved: items.filter((i) => i.status === "APPROVED"),
    rejected: items.filter(
      (i) => i.status === "REJECTED" || i.status === "CANCELLED",
    ),
  };
}

interface SectionProps {
  title: string;
  items: Item[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onCancel?: (id: string) => void;
  onEdit?: (item: Item) => void;
  onRevoke?: (id: string) => void;
  showUser?: boolean;
}

function Section({
  title,
  items,
  onApprove,
  onReject,
  onCancel,
  onEdit,
  onRevoke,
  showUser,
}: SectionProps) {
  const t = useTranslations();
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="min-w-0">
              {showUser && item.user && (
                <p className="text-sm font-medium text-slate-900">
                  {item.user.name}
                </p>
              )}
              <p className="text-sm text-slate-700">
                {new Date(item.startsAt).toLocaleDateString()}
                {" - "}
                {new Date(item.endsAt).toLocaleDateString()}
              </p>
              {item.reason && (
                <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {onApprove && (
                <Button size="sm" onClick={() => onApprove(item.id)}>
                  {t("timeOff.approve")}
                </Button>
              )}
              {onReject && (
                <Button size="sm" variant="outline" onClick={() => onReject(item.id)}>
                  {t("timeOff.reject")}
                </Button>
              )}
              {onEdit && (
                <Button size="sm" variant="outline" onClick={() => onEdit(item)}>
                  {t("timeOff.edit")}
                </Button>
              )}
              {onCancel && (
                <Button size="sm" variant="ghost" onClick={() => onCancel(item.id)}>
                  {t("timeOff.cancel")}
                </Button>
              )}
              {onRevoke && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRevoke(item.id)}
                >
                  {t("timeOff.revoke")}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface EditPayload {
  id: string;
  startsAt: Date;
  endsAt: Date;
  reason?: string;
}

function EditDialog({
  item,
  onClose,
  onSubmit,
  isPending,
}: {
  item: Item | null;
  onClose: () => void;
  onSubmit: (payload: EditPayload) => void;
  isPending: boolean;
}) {
  const t = useTranslations();
  return (
    <Dialog.Root open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-slate-900">
            {t("timeOff.editTitle")}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-slate-600">
            {t("timeOff.editHelp")}
          </Dialog.Description>
          {item && (
            <EditForm
              item={item}
              isPending={isPending}
              onCancel={onClose}
              onSubmit={onSubmit}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditForm({
  item,
  isPending,
  onCancel,
  onSubmit,
}: {
  item: Item;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (payload: EditPayload) => void;
}) {
  const t = useTranslations();
  const [from, setFrom] = useState(toDateInput(item.startsAt));
  const [to, setTo] = useState(toDateInput(item.endsAt));
  const [reason, setReason] = useState(item.reason ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!from || !to) return;
        onSubmit({
          id: item.id,
          startsAt: new Date(from + "T00:00:00"),
          endsAt: new Date(to + "T23:59:59"),
          reason: reason || undefined,
        });
      }}
      className="mt-4 space-y-3"
    >
      <div>
        <Label htmlFor="edit-from">{t("timeOff.from")}</Label>
        <Input
          id="edit-from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="edit-to">{t("timeOff.to")}</Label>
        <Input
          id="edit-to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="edit-reason">{t("timeOff.reason")}</Label>
        <Input
          id="edit-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("shift.close")}
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {t("availability.save")}
        </Button>
      </div>
    </form>
  );
}

function toDateInput(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
