-- Structured Belgian student-contract fields on worker_contracts

ALTER TABLE "worker_contracts"
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduleText" TEXT,
  ADD COLUMN IF NOT EXISTS "hourlyWageCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "jobDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "employerSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "studentSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "pdfUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "pdfHash" TEXT;
