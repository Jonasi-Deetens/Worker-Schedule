-- Rescheduled-shift reconfirmation: assignments drop to a pending state that
-- the worker must re-confirm (or decline) after a time/role change.

CREATE TYPE "AssignmentStatus" AS ENUM ('CONFIRMED', 'PENDING_RECONFIRMATION');

ALTER TYPE "NotificationType" ADD VALUE 'SHIFT_RESCHEDULED';

ALTER TYPE "AuditAction" ADD VALUE 'SHIFT_RESCHEDULE_PENDING';
ALTER TYPE "AuditAction" ADD VALUE 'SHIFT_RECONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'SHIFT_RECONFIRM_DECLINED';

ALTER TABLE "shift_assignments"
  ADD COLUMN "status" "AssignmentStatus" NOT NULL DEFAULT 'CONFIRMED';

CREATE INDEX "shift_assignments_userId_status_idx" ON "shift_assignments"("userId", "status");
