-- Per-business public-holiday overrides feeding the payroll HOLIDAY wage bucket.

CREATE TABLE IF NOT EXISTS "holidays" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "holidays_businessId_date_key"
  ON "holidays" ("businessId", "date");

CREATE INDEX IF NOT EXISTS "holidays_businessId_idx"
  ON "holidays" ("businessId");

ALTER TABLE "holidays"
  ADD CONSTRAINT "holidays_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
