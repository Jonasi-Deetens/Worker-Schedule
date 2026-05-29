-- Dimona OUT tracking + worker contracts + business contract gate

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DIMONA_OUT_DECLARED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONTRACT_SENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONTRACT_SIGNED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONTRACT_DECLINED';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTRACT_SENT';

CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'DECLINED');

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "requireSignedContract" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "dimona_declarations"
  ADD COLUMN IF NOT EXISTS "outDeclaredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "outResponsePayload" JSONB;

CREATE TABLE IF NOT EXISTS "worker_contracts" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contractType" "ContractType",
  "title" TEXT NOT NULL,
  "body" TEXT,
  "fileUrl" TEXT,
  "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
  "sentAt" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "signatureName" TEXT,
  "signatureIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "worker_contracts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "worker_contracts_businessId_status_idx"
  ON "worker_contracts"("businessId", "status");
CREATE INDEX IF NOT EXISTS "worker_contracts_userId_status_idx"
  ON "worker_contracts"("userId", "status");

ALTER TABLE "worker_contracts"
  ADD CONSTRAINT "worker_contracts_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "worker_contracts"
  ADD CONSTRAINT "worker_contracts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
