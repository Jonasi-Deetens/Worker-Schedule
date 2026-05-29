"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import { DimonaDeclarationsPanel } from "./dimona-declarations-panel";

export function IntegrationsClient() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const settings = trpc.business.settings.useQuery();

  const [employerId, setEmployerId] = useState("");
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const [addressLine, setAddressLine] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [cbeNumber, setCbeNumber] = useState("");

  useEffect(() => {
    if (!settings.data) return;
    setEmployerId(settings.data.dimonaEmployerId ?? "");
    setAddressLine(settings.data.addressLine ?? "");
    setPostalCode(settings.data.postalCode ?? "");
    setCity(settings.data.city ?? "");
    setCbeNumber(settings.data.cbeNumber ?? "");
  }, [settings.data]);

  const updateEmployerProfile = trpc.business.updateEmployerProfile.useMutation({
    onSuccess: () => {
      utils.business.settings.invalidate();
      toast.success(t("integrations.employerProfileSaved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const [quotaBuffer, setQuotaBuffer] = useState("0");
  const [attestationMaxAge, setAttestationMaxAge] = useState("365");

  useEffect(() => {
    if (!settings.data) return;
    setQuotaBuffer(String(settings.data.studentQuotaHardStopBufferHours ?? 0));
    setAttestationMaxAge(String(settings.data.attestationMaxAgeDays ?? 365));
  }, [settings.data]);

  const updateStudentQuotaPolicy =
    trpc.business.updateStudentQuotaPolicy.useMutation({
      onSuccess: () => {
        utils.business.settings.invalidate();
        toast.success(t("integrations.studentQuotaSaved"));
      },
      onError: (error) => toast.error(trpcErrorMessage(error, t)),
    });

  const updateStudentAttestationPolicy =
    trpc.business.updateStudentAttestationPolicy.useMutation({
      onSuccess: () => {
        utils.business.settings.invalidate();
        toast.success(t("integrations.attestationSaved"));
      },
      onError: (error) => toast.error(trpcErrorMessage(error, t)),
    });

  const studentQuotaHardStop = settings.data?.studentQuotaHardStop ?? false;
  const requireStudentAttestation =
    settings.data?.requireStudentAttestation ?? false;

  const parsedBuffer = () => {
    const n = parseInt(quotaBuffer, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const parsedMaxAge = () => {
    const n = parseInt(attestationMaxAge, 10);
    return Number.isFinite(n) && n >= 1 ? n : 365;
  };

  const update = trpc.business.updateDimona.useMutation({
    onSuccess: () => {
      utils.business.settings.invalidate();
      setToken("");
      toast.success(t("integrations.saved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const updateContractPolicy = trpc.business.updateContractPolicy.useMutation({
    onSuccess: () => {
      utils.business.settings.invalidate();
      toast.success(t("integrations.contractPolicySaved"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const requireSignedContract = settings.data?.requireSignedContract ?? false;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Only send credentials when the owner actually typed a new token, so we
    // never overwrite a stored secret with an empty value on a plain save.
    const credentials = token
      ? JSON.stringify({ token, ...(baseUrl ? { baseUrl } : {}) })
      : undefined;
    update.mutate({
      dimonaEmployerId: employerId || null,
      dimonaCredentials: credentials,
    });
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {t("integrations.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t("integrations.subtitle")}
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            {t("integrations.dimonaTitle")}
          </div>
          <p className="text-xs text-slate-500">{t("integrations.dimonaHelp")}</p>

          <div>
            <Label htmlFor="employerId">{t("integrations.employerId")}</Label>
            <Input
              id="employerId"
              value={employerId}
              onChange={(e) => setEmployerId(e.target.value)}
              placeholder="ONSS / RSZ"
            />
          </div>

          <div>
            <Label htmlFor="token">{t("integrations.token")}</Label>
            <Input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                settings.data?.dimonaConfigured
                  ? t("integrations.tokenSet")
                  : t("integrations.tokenPlaceholder")
              }
            />
            <p className="mt-1 text-xs text-slate-500">
              {t("integrations.tokenHelp")}
            </p>
          </div>

          <div>
            <Label htmlFor="baseUrl">{t("integrations.baseUrl")}</Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://services.socialsecurity.be/REST/dimona/v1"
            />
          </div>

          <Button type="submit" disabled={update.isPending}>
            {t("integrations.save")}
          </Button>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateEmployerProfile.mutate({
              addressLine: addressLine || null,
              postalCode: postalCode || null,
              city: city || null,
              cbeNumber: cbeNumber || null,
            });
          }}
          className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            {t("integrations.employerProfileTitle")}
          </h2>
          <p className="text-xs text-slate-500">
            {t("integrations.employerProfileHelp")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="employerAddress">
                {t("integrations.employerAddress")}
              </Label>
              <Input
                id="employerAddress"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="employerPostalCode">
                {t("integrations.employerPostalCode")}
              </Label>
              <Input
                id="employerPostalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="employerCity">
                {t("integrations.employerCity")}
              </Label>
              <Input
                id="employerCity"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="cbeNumber">{t("integrations.cbeNumber")}</Label>
              <Input
                id="cbeNumber"
                value={cbeNumber}
                onChange={(e) => setCbeNumber(e.target.value)}
                placeholder="0000.000.000"
              />
              <p className="mt-1 text-xs text-slate-500">
                {t("integrations.cbeNumberHelp")}
              </p>
            </div>
          </div>
          <Button type="submit" disabled={updateEmployerProfile.isPending}>
            {t("integrations.save")}
          </Button>
        </form>

        <DimonaDeclarationsPanel />

        <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            {t("integrations.studentQuotaTitle")}
          </h2>
          <p className="text-xs text-slate-500">
            {t("integrations.studentQuotaHelp")}
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={studentQuotaHardStop}
              disabled={updateStudentQuotaPolicy.isPending || settings.isLoading}
              onChange={(e) =>
                updateStudentQuotaPolicy.mutate({
                  studentQuotaHardStop: e.target.checked,
                  studentQuotaHardStopBufferHours: parsedBuffer(),
                })
              }
            />
            {t("integrations.studentQuotaRequire")}
          </label>
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <div className="w-40">
              <Label htmlFor="quotaBuffer">
                {t("integrations.studentQuotaBuffer")}
              </Label>
              <Input
                id="quotaBuffer"
                type="number"
                min={0}
                max={650}
                value={quotaBuffer}
                onChange={(e) => setQuotaBuffer(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={updateStudentQuotaPolicy.isPending || settings.isLoading}
              onClick={() =>
                updateStudentQuotaPolicy.mutate({
                  studentQuotaHardStop,
                  studentQuotaHardStopBufferHours: parsedBuffer(),
                })
              }
            >
              {t("integrations.save")}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            {t("integrations.studentQuotaBufferHelp")}
          </p>
        </section>

        <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            {t("integrations.attestationTitle")}
          </h2>
          <p className="text-xs text-slate-500">
            {t("integrations.attestationHelp")}
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={requireStudentAttestation}
              disabled={
                updateStudentAttestationPolicy.isPending || settings.isLoading
              }
              onChange={(e) =>
                updateStudentAttestationPolicy.mutate({
                  requireStudentAttestation: e.target.checked,
                  attestationMaxAgeDays: parsedMaxAge(),
                })
              }
            />
            {t("integrations.attestationRequire")}
          </label>
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <div className="w-40">
              <Label htmlFor="attestationMaxAge">
                {t("integrations.attestationMaxAge")}
              </Label>
              <Input
                id="attestationMaxAge"
                type="number"
                min={1}
                max={3650}
                value={attestationMaxAge}
                onChange={(e) => setAttestationMaxAge(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={
                updateStudentAttestationPolicy.isPending || settings.isLoading
              }
              onClick={() =>
                updateStudentAttestationPolicy.mutate({
                  requireStudentAttestation,
                  attestationMaxAgeDays: parsedMaxAge(),
                })
              }
            >
              {t("integrations.save")}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            {t("integrations.attestationMaxAgeHelp")}
          </p>
        </section>

        <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            {t("integrations.contractPolicyTitle")}
          </h2>
          <p className="text-xs text-slate-500">
            {t("integrations.contractPolicyHelp")}
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={requireSignedContract}
              disabled={updateContractPolicy.isPending || settings.isLoading}
              onChange={(e) =>
                updateContractPolicy.mutate({
                  requireSignedContract: e.target.checked,
                })
              }
            />
            {t("integrations.contractPolicyRequire")}
          </label>
        </section>
      </main>
    </div>
  );
}
