-- Notify managers when a worker submits hours (clock-out) and notify workers
-- when their entry is approved or rejected.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_REJECTED';
