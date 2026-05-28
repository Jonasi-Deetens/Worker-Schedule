"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

const ALL_SCOPES = [
  "shifts:read",
  "shifts:write",
  "assignments:read",
  "assignments:write",
  "workers:read",
] as const;

const ALL_EVENTS = [
  "shift.created",
  "shift.updated",
  "shift.published",
  "assignment.created",
  "assignment.cancelled",
] as const;

export function DevelopersClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const keys = trpc.apiKey.list.useQuery();
  const hooks = trpc.webhook.list.useQuery();
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["shifts:read"]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>(["shift.created"]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const createKey = trpc.apiKey.create.useMutation({
    onSuccess: (data) => {
      if (!data) return;
      setCreatedKey(data.raw);
      setKeyName("");
      utils.apiKey.list.invalidate();
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const revokeKey = trpc.apiKey.revoke.useMutation({
    onSuccess: () => utils.apiKey.list.invalidate(),
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const createHook = trpc.webhook.create.useMutation({
    onSuccess: (data) => {
      if (!data) return;
      setCreatedSecret(data.secret);
      setHookUrl("");
      utils.webhook.list.invalidate();
    },
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });
  const deleteHook = trpc.webhook.delete.useMutation({
    onSuccess: () => utils.webhook.list.invalidate(),
    onError: (e) => toast.error(trpcErrorMessage(e, t)),
  });

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Developers</h1>
        <p className="text-sm text-slate-600">
          API keys and webhooks for integrating Tattoogenda with payroll, POS or
          custom dashboards.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">API keys</h2>
        <p className="mt-1 text-sm text-slate-600">
          Send the key as <code>Authorization: Bearer …</code>. Scopes are
          limited to the surface area you grant.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createKey.mutate({
              name: keyName,
              scopes: keyScopes as typeof ALL_SCOPES[number][],
            });
          }}
        >
          <div>
            <Label htmlFor="keyName">Name</Label>
            <Input
              id="keyName"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              required
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Scopes</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {ALL_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={keyScopes.includes(scope)}
                    onChange={(e) =>
                      setKeyScopes((prev) =>
                        e.target.checked
                          ? [...prev, scope]
                          : prev.filter((s) => s !== scope),
                      )
                    }
                  />
                  <code className="text-xs">{scope}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={createKey.isPending}>
            Create key
          </Button>
        </form>
        {createdKey && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-900">
              Copy this key now — it will not be shown again.
            </p>
            <code className="mt-1 block break-all rounded-md bg-white p-2 text-xs">
              {createdKey}
            </code>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setCreatedKey(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        <ul className="mt-4 divide-y divide-slate-100">
          {keys.data?.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-slate-900">{k.name}</div>
                <div className="text-xs text-slate-500">
                  <code>{k.prefix}…</code> · {k.scopes.join(", ")}
                </div>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => revokeKey.mutate({ id: k.id })}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Webhooks</h2>
        <p className="mt-1 text-sm text-slate-600">
          We POST JSON events to your endpoint. Verify the{" "}
          <code>X-Tattoogenda-Signature</code> header with the per-webhook
          secret.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createHook.mutate({
              url: hookUrl,
              events: hookEvents as typeof ALL_EVENTS[number][],
            });
          }}
        >
          <div>
            <Label htmlFor="hookUrl">Endpoint URL</Label>
            <Input
              id="hookUrl"
              type="url"
              value={hookUrl}
              onChange={(e) => setHookUrl(e.target.value)}
              required
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Events</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {ALL_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hookEvents.includes(event)}
                    onChange={(e) =>
                      setHookEvents((prev) =>
                        e.target.checked
                          ? [...prev, event]
                          : prev.filter((s) => s !== event),
                      )
                    }
                  />
                  <code className="text-xs">{event}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={createHook.isPending}>
            Add webhook
          </Button>
        </form>
        {createdSecret && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-900">
              Webhook signing secret (shown once):
            </p>
            <code className="mt-1 block break-all rounded-md bg-white p-2 text-xs">
              {createdSecret}
            </code>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setCreatedSecret(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        <ul className="mt-4 divide-y divide-slate-100">
          {hooks.data?.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-slate-900">{h.url}</div>
                <div className="text-xs text-slate-500">
                  {h.events.join(", ")}
                </div>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deleteHook.mutate({ id: h.id })}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
