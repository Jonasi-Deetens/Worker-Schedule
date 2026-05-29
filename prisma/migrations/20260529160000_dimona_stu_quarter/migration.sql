-- Per-quarter Belgian Dimona STU (student) declarations.

CREATE TABLE IF NOT EXISTS "dimona_stu_declarations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "quarter" INTEGER NOT NULL,
  "plannedHours" INTEGER NOT NULL DEFAULT 0,
  "reservedHours" INTEGER NOT NULL DEFAULT 0,
  "status" "DimonaStatus" NOT NULL DEFAULT 'PENDING',
  "dimonaPeriodId" TEXT,
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dimona_stu_declarations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dimona_stu_declarations_userId_businessId_year_quarter_key"
  ON "dimona_stu_declarations" ("userId", "businessId", "year", "quarter");

CREATE INDEX IF NOT EXISTS "dimona_stu_declarations_businessId_year_quarter_idx"
  ON "dimona_stu_declarations" ("businessId", "year", "quarter");

ALTER TABLE "dimona_stu_declarations"
  ADD CONSTRAINT "dimona_stu_declarations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dimona_stu_declarations"
  ADD CONSTRAINT "dimona_stu_declarations_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
