/**
 * Next.js instrumentation hook. Runs once per server start.
 *
 * Sentry is wired conditionally so production environments can enable error
 * reporting without forcing local development to install the SDK. Drop in
 * `@sentry/nextjs` and set `SENTRY_DSN` to activate it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Validate env on first server boot — throws and surfaces a readable list
  // of missing/invalid variables instead of letting requests fail randomly.
  await import("@/lib/env").catch((err: unknown) => {
    console.error("Env validation failed at boot:", err);
    throw err;
  });

  if (!process.env.SENTRY_DSN) return;

  try {
    // Dynamic import keeps the dependency optional.
    const Sentry = await import(
      /* webpackIgnore: true */ "@sentry/nextjs" as string
    ).catch(() => null);
    if (!Sentry) return;
    (Sentry as { init?: (cfg: unknown) => void }).init?.({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      environment: process.env.NODE_ENV,
    });
  } catch {
    // Sentry not installed - silently skip
  }
}
