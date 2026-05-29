/**
 * Provisions the MinIO bucket used for document and avatar uploads.
 *
 * Community MinIO only supports cluster-wide CORS (via MINIO_API_CORS_ALLOW_ORIGIN),
 * not per-bucket rules. This script writes that value, recreates MinIO if needed,
 * then uses `mc` on the compose network to create the bucket and (for local dev)
 * allow anonymous read so stored object URLs work without presigned GET.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function loadEnvFiles() {
  for (const file of [".env", ".env.local"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example and fill STORAGE_* vars.`);
  }
  return value;
}

function corsOrigins(): string[] {
  const origins = new Set<string>(["http://localhost:3000", "http://127.0.0.1:3000"]);
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  if (nextAuthUrl) {
    try {
      origins.add(new URL(nextAuthUrl).origin);
    } catch {
      // ignore malformed NEXTAUTH_URL
    }
  }
  const extra = process.env.STORAGE_CORS_ORIGINS?.trim();
  if (extra) {
    for (const origin of extra.split(",")) {
      const o = origin.trim();
      if (o) origins.add(o);
    }
  }
  return [...origins];
}

function isLocalDevEndpoint(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

function upsertEnvLocal(key: string, value: string) {
  const file = path.resolve(process.cwd(), ".env.local");
  const line = `${key}="${value}"`;
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${line}\n`);
    return;
  }
  const content = fs.readFileSync(file, "utf8");
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    fs.writeFileSync(file, content.replace(pattern, line));
  } else {
    fs.writeFileSync(file, `${content.replace(/\s*$/, "")}\n${line}\n`);
  }
}

async function waitForMinioHealth(endpoint: string, attempts = 30) {
  const healthUrl = `${endpoint.replace(/\/$/, "")}/minio/health/live`;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) return;
    } catch {
      // retry
    }
    if (i === attempts) {
      throw new Error(
        "MinIO is not reachable. Start it with `npm run storage:up` first.",
      );
    }
    process.stdout.write(`Waiting for MinIO (${i}/${attempts})…\n`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function runCompose(args: string[]) {
  const result = spawnSync("docker", ["compose", ...args], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(" ")} failed`);
  }
}

function runMcInit(input: {
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicRead: boolean;
}) {
  const shell = `
set -e
until mc alias set local http://minio:9000 "$MC_USER" "$MC_PASS" >/dev/null 2>&1; do
  echo "Waiting for MinIO inside Docker network…"
  sleep 1
done
mc mb --ignore-existing "local/$MC_BUCKET"
if [ "$MC_PUBLIC_READ" = "true" ]; then
  mc anonymous set download "local/$MC_BUCKET"
  echo "Public read enabled on local/$MC_BUCKET (dev only)."
else
  echo "Skipped public read policy (non-local endpoint)."
fi
echo "Storage setup complete."
`.trim();

  const result = spawnSync(
    "docker",
    [
      "compose",
      "--profile",
      "storage",
      "run",
      "--rm",
      "--no-deps",
      "-e",
      `MC_USER=${input.accessKey}`,
      "-e",
      `MC_PASS=${input.secretKey}`,
      "-e",
      `MC_BUCKET=${input.bucket}`,
      "-e",
      `MC_PUBLIC_READ=${input.publicRead ? "true" : "false"}`,
      "minio-mc",
      "-ec",
      shell,
    ],
    { stdio: "inherit", cwd: process.cwd() },
  );

  if (result.status !== 0) {
    throw new Error("MinIO setup failed. Is Docker running and MinIO started?");
  }
}

async function main() {
  loadEnvFiles();

  const endpoint = required("STORAGE_ENDPOINT");
  const bucket = required("STORAGE_BUCKET");
  const accessKey = required("STORAGE_ACCESS_KEY");
  const secretKey = required("STORAGE_SECRET_KEY");

  const origins = corsOrigins();
  const corsValue = origins.join(",");

  process.env.MINIO_API_CORS_ALLOW_ORIGIN = corsValue;
  upsertEnvLocal("MINIO_API_CORS_ALLOW_ORIGIN", corsValue);

  console.log(`Applying global MinIO CORS: ${corsValue}`);
  runCompose(["up", "-d", "minio"]);

  console.log(`Waiting for MinIO at ${endpoint}…`);
  await waitForMinioHealth(endpoint);

  const publicRead =
    process.env.STORAGE_PUBLIC_READ === "true" ||
    (process.env.STORAGE_PUBLIC_READ !== "false" &&
      isLocalDevEndpoint(endpoint));

  console.log(`Creating bucket "${bucket}"…`);
  runMcInit({
    bucket,
    accessKey,
    secretKey,
    publicRead,
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
