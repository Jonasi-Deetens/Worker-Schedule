-- Phase E: immutable time registration + corrections, optional geofence + QR.

-- New notification fired when an already-approved entry is corrected.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_CORRECTED';

-- Optional geofence enforcement toggle (off by default).
ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "enforceGeofence" BOOLEAN NOT NULL DEFAULT false;

-- Per-location signed QR secret backing the QR clock-in token.
ALTER TABLE "locations"
  ADD COLUMN IF NOT EXISTS "qrSecret" TEXT;

-- Coordinates captured at clock-in when geofence enforcement is enabled.
ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "clockInLat" DECIMAL(10,7);
ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "clockInLng" DECIMAL(10,7);

-- Append-only correction trail with mandatory reason + before/after snapshot.
CREATE TABLE IF NOT EXISTS "time_entry_corrections" (
  "id" TEXT NOT NULL,
  "timeEntryId" TEXT NOT NULL,
  "editedById" TEXT NOT NULL,
  "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT NOT NULL,
  "prevClockInAt" TIMESTAMP(3) NOT NULL,
  "prevClockOutAt" TIMESTAMP(3),
  "prevBreakMinutes" INTEGER NOT NULL,
  "newClockInAt" TIMESTAMP(3) NOT NULL,
  "newClockOutAt" TIMESTAMP(3),
  "newBreakMinutes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "time_entry_corrections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "time_entry_corrections_timeEntryId_idx"
  ON "time_entry_corrections" ("timeEntryId");

ALTER TABLE "time_entry_corrections"
  ADD CONSTRAINT "time_entry_corrections_timeEntryId_fkey"
  FOREIGN KEY ("timeEntryId") REFERENCES "time_entries" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
