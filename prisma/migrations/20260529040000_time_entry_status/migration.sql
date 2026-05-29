-- Time entry review lifecycle: explicit status (PENDING/APPROVED/REJECTED),
-- a reviewer note, and audit actions for reject/edit. Existing approved rows
-- (approvedAt set) are backfilled to APPROVED; everything else stays PENDING.

-- New enum for the explicit review state.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TimeEntryStatus') THEN
    CREATE TYPE "TimeEntryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END
$$;

-- Status column defaults to PENDING for new rows.
ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "status" "TimeEntryStatus" NOT NULL DEFAULT 'PENDING';

-- Reviewer note captured on reject/edit.
ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

-- Backfill: rows already approved keep their state.
UPDATE "time_entries"
  SET "status" = 'APPROVED'
  WHERE "approvedAt" IS NOT NULL;

-- Index the status for the pending/approved manager queues.
CREATE INDEX IF NOT EXISTS "time_entries_status_idx" ON "time_entries" ("status");

-- Audit actions for the new manager review capabilities.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_EDITED';
