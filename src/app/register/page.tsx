"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/interface/components/ui/button";
import { Input } from "@/interface/components/ui/input";
import { Label } from "@/interface/components/ui/label";
import { trpc } from "@/interface/trpc/client";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"OWNER" | "WORKER">("WORKER");

  const register = trpc.auth.register.useMutation({
    onSuccess: () => {
      router.push("/login?registered=1");
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    register.mutate({
      email: form.get("email") as string,
      password: form.get("password") as string,
      name: form.get("name") as string,
      role,
      businessName:
        role === "OWNER"
          ? (form.get("businessName") as string)
          : undefined,
      businessId:
        role === "WORKER"
          ? (form.get("businessId") as string) || undefined
          : undefined,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Create account</h1>
        <p className="mt-1 text-sm text-slate-600">
          Join as owner or worker
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="password">Password (min 8 characters)</Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700">I am a</legend>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="role"
                  checked={role === "WORKER"}
                  onChange={() => setRole("WORKER")}
                />
                Worker
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="role"
                  checked={role === "OWNER"}
                  onChange={() => setRole("OWNER")}
                />
                Owner
              </label>
            </div>
          </fieldset>

          {role === "OWNER" ? (
            <div>
              <Label htmlFor="businessName">Business name</Label>
              <Input id="businessName" name="businessName" required />
            </div>
          ) : (
            <div>
              <Label htmlFor="businessId">Business ID</Label>
              <Input
                id="businessId"
                name="businessId"
                placeholder="Ask your manager for this ID"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                Demo: use the business ID from seed output or README.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? "Creating…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-indigo-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
