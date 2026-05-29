-- Student@Work attestation enforcement + configurable 650h hard-stop buffer.

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "studentQuotaHardStopBufferHours" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "requireStudentAttestation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "attestationMaxAgeDays" INTEGER NOT NULL DEFAULT 365;
