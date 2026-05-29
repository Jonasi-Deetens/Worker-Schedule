"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";

export function LocationsClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const locationsQuery = trpc.location.list.useQuery();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const createLocation = trpc.location.create.useMutation({
    onSuccess: () => {
      utils.location.list.invalidate();
      setName("");
      setAddress("");
      toast.success(t("locations.saved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const deleteLocation = trpc.location.delete.useMutation({
    onSuccess: () => {
      utils.location.list.invalidate();
      toast.success(t("locations.removed"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const locations = (locationsQuery.data ?? []) as Array<{
    id: string;
    name: string;
    address: string | null;
  }>;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {t("locations.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t("locations.subtitle")}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createLocation.mutate({
              name: name.trim(),
              address: address.trim() || undefined,
            });
          }}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="min-w-[160px] flex-1">
            <Label htmlFor="loc-name">{t("locations.name")}</Label>
            <Input
              id="loc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="loc-address">{t("locations.address")}</Label>
            <Input
              id="loc-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={200}
            />
          </div>
          <Button type="submit" disabled={createLocation.isPending}>
            <Plus className="mr-1 h-4 w-4" />
            {t("locations.add")}
          </Button>
        </form>

        <section className="mt-6">
          {locationsQuery.isLoading && (
            <p className="text-sm text-slate-500">{t("hours.loading")}</p>
          )}
          {locationsQuery.data && locations.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              {t("locations.empty")}
            </p>
          )}
          <ul className="space-y-2">
            {locations.map((location) => (
              <li
                key={location.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" aria-hidden />
                  <span className="font-medium text-slate-900">
                    {location.name}
                  </span>
                  {location.address && (
                    <span className="text-xs text-slate-500">
                      {location.address}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteLocation.mutate({ id: location.id })}
                  disabled={deleteLocation.isPending}
                  aria-label={t("locations.delete")}
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
