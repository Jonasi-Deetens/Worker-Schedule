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

  // Sentry is a real dependency now, but initialization stays gated on the
  // optional `SENTRY_DSN` env so DSN-less dev/test/CI boots are unaffected and
  // never open a transport. The import is dynamic so the SDK is only pulled in
  // when error reporting is actually enabled.
  if (!process.env.SENTRY_DSN) return;

  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      environment: process.env.NODE_ENV,
    });
  } catch (err) {
    // Never let observability wiring crash the server boot.
    console.error("Sentry initialization failed:", err);
  }
}
