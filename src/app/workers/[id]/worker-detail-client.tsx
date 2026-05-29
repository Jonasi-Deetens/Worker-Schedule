"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Check, X } from "lucide-react";
import { AppHeader } from "@/interface/components/app-header";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";
import { toast, trpcErrorMessage } from "@/lib/toast";
import { StudentQuotaWidget } from "@/interface/components/student-quota-widget";
import { WorkerContractsSection } from "./worker-contracts-section";

const CONTRACT_TYPES = ["FLEXI", "JOBSTUDENT", "EMPLOYEE", "EXTRA"] as const;
const REGIONS = ["FLANDERS", "BRUSSELS", "WALLONIA", "EAST_BELGIUM"] as const;

export function WorkerDetailClient({ workerId }: { workerId: string }) {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const workerQuery = trpc.worker.get.useQuery({ id: workerId });
  const statsQuery = trpc.worker.stats.useQuery({ id: workerId });
  const documentsQuery = trpc.worker.documents.useQuery({ id: workerId });
  const contractsQuery = trpc.contract.listForWorker.useQuery({
    userId: workerId,
  });
  const skillsQuery = trpc.skill.list.useQuery();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [contractType, setContractType] = useState<string>("");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [weeklyCap, setWeeklyCap] = useState<string>("");
  const [birthDate, setBirthDate] = useState<string>("");
  const [nationalNumber, setNationalNumber] = useState<string>("");
  const [addressLine, setAddressLine] = useState<string>("");
  const [postalCode, setPostalCode] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [iban, setIban] = useState<string>("");
  const [emergencyContactName, setEmergencyContactName] = useState<string>("");
  const [emergencyContactPhone, setEmergencyContactPhone] =
    useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!workerQuery.data) return;
    const w = workerQuery.data as unknown as {
      name: string;
      phone: string | null;
      contractType: string | null;
      hourlyRate: { toString(): string } | null;
      weeklyHourCap: number | null;
      birthDate: Date | string | null;
      nationalNumber: string | null;
      addressLine: string | null;
      postalCode: string | null;
      city: string | null;
      iban: string | null;
      emergencyContactName: string | null;
      emergencyContactPhone: string | null;
      region: string | null;
      skills: { skill: { id: string } }[];
    };
    setName(w.name ?? "");
    setPhone(w.phone ?? "");
    setContractType(w.contractType ?? "");
    setHourlyRate(w.hourlyRate ? w.hourlyRate.toString() : "");
    setWeeklyCap(w.weeklyHourCap ? String(w.weeklyHourCap) : "");
    setBirthDate(
      w.birthDate ? new Date(w.birthDate).toISOString().slice(0, 10) : "",
    );
    setNationalNumber(w.nationalNumber ?? "");
    setAddressLine(w.addressLine ?? "");
    setPostalCode(w.postalCode ?? "");
    setCity(w.city ?? "");
    setIban(w.iban ?? "");
    setEmergencyContactName(w.emergencyContactName ?? "");
    setEmergencyContactPhone(w.emergencyContactPhone ?? "");
    setRegion(w.region ?? "");
    setSelectedSkills(new Set(w.skills.map((s) => s.skill.id)));
  }, [workerQuery.data]);

  const updateProfile = trpc.worker.update.useMutation({
    onSuccess: () => {
      utils.worker.get.invalidate({ id: workerId });
      utils.worker.list.invalidate();
      toast.success(t("toast.workerUpdated"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const setSkills = trpc.worker.setSkills.useMutation({
    onSuccess: () => {
      utils.worker.get.invalidate({ id: workerId });
      toast.success(t("toast.workerUpdated"));
    },
    onError: (error) => toast.error(trpcErrorMessage(error, t)),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({
      id: workerId,
      name: name || undefined,
      phone: phone || null,
      contractType: (contractType as typeof CONTRACT_TYPES[number]) || null,
      hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
      weeklyHourCap: weeklyCap ? parseInt(weeklyCap, 10) : null,
      birthDate: birthDate ? new Date(birthDate) : null,
      nationalNumber: nationalNumber ? nationalNumber : null,
      addressLine: addressLine || null,
      postalCode: postalCode || null,
      city: city || null,
      iban: iban || null,
      emergencyContactName: emergencyContactName || null,
      emergencyContactPhone: emergencyContactPhone || null,
      region: (region as typeof REGIONS[number]) || null,
    });
    setSkills.mutate({
      userId: workerId,
      skillIds: [...selectedSkills],
    });
  };

  const toggleSkill = (id: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (workerQuery.isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <p className="text-sm text-slate-500">{t("hours.loading")}</p>
        </main>
      </div>
    );
  }

  if (!workerQuery.data) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <p className="text-sm text-slate-500">Not found.</p>
        </main>
      </div>
    );
  }

  const worker = workerQuery.data as unknown as {
    id: string;
    name: string;
    email: string;
    status: string;
    contractType: string | null;
    nationalNumber: string | null;
    birthDate: Date | string | null;
  };

  const documents = (documentsQuery.data ?? []) as Array<{
    id: string;
    kind: string;
    fileName: string;
    url: string;
    expiresOn: string | Date | null;
  }>;

  const contracts = (contractsQuery.data ?? []) as Array<{ status: string }>;
  const hasDoc = (kind: string) => documents.some((d) => d.kind === kind);
  const onboardingItems = [
    { key: "signedContract", done: contracts.some((c) => c.status === "SIGNED") },
    { key: "niss", done: Boolean(worker.nationalNumber) },
    { key: "birthDate", done: Boolean(worker.birthDate) },
    { key: "idDocument", done: hasDoc("ID_CARD") },
    { key: "enrollment", done: hasDoc("ENROLLMENT_CERTIFICATE") },
    { key: "studentAtWork", done: hasDoc("STUDENT_AT_WORK_ATTESTATION") },
  ];
  const onboardingDone = onboardingItems.filter((i) => i.done).length;
  const now = Date.now();
  const soonMs = 30 * 86_400_000;
  const expiringSoon = documents.filter(
    (d) =>
      d.expiresOn &&
      new Date(d.expiresOn).getTime() - now < soonMs &&
      new Date(d.expiresOn).getTime() > now,
  );
  const expired = documents.filter(
    (d) => d.expiresOn && new Date(d.expiresOn).getTime() <= now,
  );

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Link
          href="/workers"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("workers.title")}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{worker.name}</h1>
          {worker.contractType && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {worker.contractType}
            </span>
          )}
          {(statsQuery.data?.noShowsAllTime ?? 0) > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
              {t("workers.noShowsBadge", {
                count: statsQuery.data?.noShowsAllTime ?? 0,
              })}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600">{worker.email}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <StatCard
            label={t("workers.hoursThisMonth")}
            value={statsQuery.data?.hoursThisMonth ?? "--"}
            suffix="h"
          />
          <StatCard
            label={t("workers.hoursThisYear")}
            value={statsQuery.data?.hoursThisYear ?? "--"}
            suffix="h"
          />
          <StatCard
            label={t("workers.upcoming")}
            value={statsQuery.data?.upcoming ?? "--"}
            suffix=""
          />
          <StatCard
            label={t("workers.noShowRate")}
            value={
              statsQuery.data
                ? `${statsQuery.data.noShowRate90d}%`
                : "--"
            }
            suffix=""
            tone={
              (statsQuery.data?.noShowRate90d ?? 0) >= 10
                ? "warn"
                : "default"
            }
          />
        </div>

        {(expired.length > 0 || expiringSoon.length > 0) && (
          <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <h2 className="mb-2 text-sm font-semibold text-amber-900">
              {t("workers.docsAttention")}
            </h2>
            <ul className="space-y-1.5 text-sm">
              {expired.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <span className="font-medium text-rose-700">{d.kind}</span>
                  <span className="text-slate-700">{d.fileName}</span>
                  <span className="ml-auto text-xs text-rose-700">
                    {t("workers.docsExpired", {
                      date: new Date(d.expiresOn!).toLocaleDateString(),
                    })}
                  </span>
                </li>
              ))}
              {expiringSoon.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span className="font-medium text-amber-800">{d.kind}</span>
                  <span className="text-slate-700">{d.fileName}</span>
                  <span className="ml-auto text-xs text-amber-800">
                    {t("workers.docsExpiringOn", {
                      date: new Date(d.expiresOn!).toLocaleDateString(),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {worker.contractType === "JOBSTUDENT" && (
          <section
            className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            aria-labelledby="onboarding-heading"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id="onboarding-heading"
                className="text-sm font-semibold text-slate-900"
              >
                {t("onboarding.title")}
              </h2>
              <span className="text-xs font-medium text-slate-500">
                {t("onboarding.progress", {
                  done: onboardingDone,
                  total: onboardingItems.length,
                })}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{t("onboarding.help")}</p>
            <ul className="mt-3 space-y-2">
              {onboardingItems.map((item) => (
                <li key={item.key} className="flex items-center gap-2 text-sm">
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      item.done
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {item.done ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className={item.done ? "text-slate-700" : "text-slate-500"}
                  >
                    {t(`onboarding.items.${item.key}`)}
                  </span>
                  <span className="sr-only">
                    {item.done
                      ? t("onboarding.statusDone")
                      : t("onboarding.statusMissing")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {worker.contractType === "JOBSTUDENT" && (
          <StudentQuotaWidget mode="manager" userId={workerId} />
        )}

        <WorkerContractsSection workerId={workerId} />

        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">{t("auth.name")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="phone">{t("workers.phone")}</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contractType">{t("workers.contractType")}</Label>
              <select
                id="contractType"
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">{t("workers.noContract")}</option>
                {CONTRACT_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="birthDate">{t("workers.birthDate")}</Label>
              <Input
                id="birthDate"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="hourlyRate">{t("workers.hourlyRate")} (EUR)</Label>
              <Input
                id="hourlyRate"
                type="number"
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="weeklyCap">{t("workers.weeklyCap")} (h)</Label>
              <Input
                id="weeklyCap"
                type="number"
                value={weeklyCap}
                onChange={(e) => setWeeklyCap(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="nationalNumber">
                {t("workers.nationalNumber")}
              </Label>
              <Input
                id="nationalNumber"
                value={nationalNumber}
                onChange={(e) => setNationalNumber(e.target.value)}
                placeholder="00.00.00-000.00"
                inputMode="numeric"
              />
              <p className="mt-1 text-xs text-slate-500">
                {t("workers.nationalNumberHelp")}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="addressLine">{t("workers.addressLine")}</Label>
              <Input
                id="addressLine"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="postalCode">{t("workers.postalCode")}</Label>
              <Input
                id="postalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="city">{t("workers.city")}</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="region">{t("workers.region")}</Label>
              <select
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">{t("workers.regionNone")}</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`workers.regions.${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="iban">{t("workers.iban")}</Label>
              <Input
                id="iban"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="BE00 0000 0000 0000"
              />
            </div>
            <div>
              <Label htmlFor="emergencyContactName">
                {t("workers.emergencyContactName")}
              </Label>
              <Input
                id="emergencyContactName"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="emergencyContactPhone">
                {t("workers.emergencyContactPhone")}
              </Label>
              <Input
                id="emergencyContactPhone"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>{t("workers.skills")}</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(skillsQuery.data ?? []).map((skill) => {
                const active = selectedSkills.has(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => toggleSkill(skill.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      active
                        ? "border-transparent text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                    style={
                      active
                        ? { background: skill.color }
                        : { borderColor: skill.color }
                    }
                  >
                    {skill.name}
                  </button>
                );
              })}
              {(skillsQuery.data ?? []).length === 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{t("skills.emptyCatalog")}</span>
                  <Link
                    href="/settings/skills"
                    className="font-medium text-emerald-600 hover:underline"
                  >
                    {t("skills.manageLink")} →
                  </Link>
                </div>
              )}
            </div>
          </div>

          <Button type="submit" disabled={updateProfile.isPending}>
            {t("workers.saveProfile")}
          </Button>
        </form>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  tone = "default",
}: {
  label: string;
  value: number | string;
  suffix: string;
  tone?: "default" | "warn";
}) {
  const valueClass =
    tone === "warn"
      ? "text-xl font-semibold text-rose-700"
      : "text-xl font-semibold text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 ${valueClass}`}>
        {value}
        {suffix && <span className="text-sm text-slate-500"> {suffix}</span>}
      </p>
    </div>
  );
}
