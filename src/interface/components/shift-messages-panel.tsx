"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

interface ShiftMessagesPanelProps {
  shiftId: string;
}

/**
 * Lightweight per-shift chat. Polls every 15s on top of SSE invalidations so
 * the UI stays fresh even when the SSE channel is briefly unavailable.
 */
export function ShiftMessagesPanel({ shiftId }: ShiftMessagesPanelProps) {
  const t = useTranslations();
  const [body, setBody] = useState("");
  const messages = trpc.shiftMessage.list.useQuery(
    { shiftId },
    { refetchInterval: 15_000 },
  );
  const utils = trpc.useUtils();
  const post = trpc.shiftMessage.post.useMutation({
    onSuccess: () => {
      setBody("");
      utils.shiftMessage.list.invalidate({ shiftId });
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-xs font-semibold uppercase text-slate-500">
        {t("shiftChat.title")}
      </h3>
      <ol className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">
        {messages.data?.length === 0 && (
          <li className="text-xs text-slate-500">{t("shiftChat.empty")}</li>
        )}
        {messages.data?.map((m) => (
          <li key={m.id} className="rounded-md bg-white px-2 py-1.5 shadow-sm">
            <div className="text-xs font-semibold text-slate-700">
              {m.author.name}
              <span className="ml-2 font-normal text-slate-400">
                {new Date(m.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="text-slate-800">{m.body}</div>
          </li>
        ))}
      </ol>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          post.mutate({ shiftId, body });
        }}
      >
        <input
          type="text"
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("shiftChat.placeholder")}
          className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
        <Button type="submit" size="sm" disabled={!body.trim() || post.isPending}>
          {t("shiftChat.send")}
        </Button>
      </form>
    </section>
  );
}
