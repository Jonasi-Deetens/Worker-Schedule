-- Belgian student-worker 650h/calendar-year quota ledger + per-business hard stop.

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "studentQuotaHardStop" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "student_quotas" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "reservedHours" INTEGER NOT NULL DEFAULT 0,
  "workedHours" INTEGER NOT NULL DEFAULT 0,
  "studentAtWorkBalanceHours" INTEGER,
  "attestationUploadedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_quotas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_quotas_userId_year_key"
  ON "student_quotas" ("userId", "year");

CREATE INDEX IF NOT EXISTS "student_quotas_businessId_year_idx"
  ON "student_quotas" ("businessId", "year");

ALTER TABLE "student_quotas"
  ADD CONSTRAINT "student_quotas_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_quotas"
  ADD CONSTRAINT "student_quotas_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
