-- Dual signing lifecycle + drawn signature metadata
ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'WORKER_SIGNED';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONTRACT_WORKER_SIGNED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONTRACT_EMPLOYER_SIGNED';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTRACT_WORKER_SIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTRACT_FULLY_SIGNED';

ALTER TABLE "worker_contracts" ADD COLUMN IF NOT EXISTS "studentSignatureUrl" TEXT;
ALTER TABLE "worker_contracts" ADD COLUMN IF NOT EXISTS "studentSignedAt" TIMESTAMP(3);
ALTER TABLE "worker_contracts" ADD COLUMN IF NOT EXISTS "studentSignatureIp" TEXT;
ALTER TABLE "worker_contracts" ADD COLUMN IF NOT EXISTS "studentSignerLabel" TEXT;
ALTER TABLE "worker_contracts" ADD COLUMN IF NOT EXISTS "employerSignatureUrl" TEXT;
ALTER TABLE "worker_contracts" ADD COLUMN IF NOT EXISTS "employerSignedAt" TIMESTAMP(3);
ALTER TABLE "worker_contracts" ADD COLUMN IF NOT EXISTS "employerSignatureIp" TEXT;
ALTER TABLE "worker_contracts" ADD COLUMN IF NOT EXISTS "employerSignerId" TEXT;
ALTER TABLE "worker_contracts" ADD COLUMN IF NOT EXISTS "employerSignerLabel" TEXT;

-- Legacy single-step signed contracts: preserve typed name as student label
UPDATE "worker_contracts"
SET "studentSignerLabel" = "signatureName"
WHERE "status" = 'SIGNED' AND "studentSignerLabel" IS NULL AND "signatureName" IS NOT NULL;
