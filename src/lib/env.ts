import { z } from "zod";

/**
 * Centralised environment-variable schema. Importing this module on boot
 * fails fast if a required value is missing, replacing the usual "undefined
 * is not iterable" crashes deep in service code with a single readable error.
 *
 * Optional values default to `undefined` (never empty strings) so downstream
 * code can use `if (env.SENTRY_DSN)` cleanly.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Core
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be ≥32 chars"),
  NEXTAUTH_URL: z.string().url().optional(),

  // OAuth (Google) - both required together, or leave both unset
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Transactional email (Resend). Disabled when either is missing.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // PWA push (set all three to enable; partial setup is rejected at runtime)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  // Belgian Dimona (ONSS) declaration adapter
  DIMONA_ENV: z.enum(["mock", "sandbox", "prod"]).default("mock"),
  DIMONA_SANDBOX_URL: z.string().url().optional(),
  DIMONA_PROD_URL: z.string().url().optional(),
  DIMONA_TOKEN: z.string().optional(),
  // 32+ char secret used to AES-256-GCM encrypt Business.dimonaCredentials
  DIMONA_ENCRYPTION_KEY: z.string().optional(),

  // Observability
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Object storage for document uploads (S3-compatible: AWS S3, R2, MinIO).
  // Leave unset to disable uploads. All five must be set together.
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().optional(),
});

type Env = z.infer<typeof schema>;

function parse(): Env {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // Use plain console.error so this is visible even before the logger boots.
    console.error(`\n❌ Invalid environment configuration:\n${issues}\n`);
    throw new Error("Invalid environment configuration");
  }
  return result.data;
}

// Skip strict validation at build time (Next.js collects pages without env)
// and during unit tests where individual vars are stubbed per-test.
const isBuild =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.SKIP_ENV_VALIDATION === "1" ||
  process.env.NODE_ENV === "test";

export const env: Env = isBuild
  ? (process.env as unknown as Env)
  : parse();

export type AppEnv = Env;
