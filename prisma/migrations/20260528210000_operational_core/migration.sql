-- Operational core: attendance tracking, broadcasts, reminders, push subscriptions.

CREATE TYPE "AttendanceStatus" AS ENUM ('ON_TIME', 'LATE', 'NO_SHOW', 'EXCUSED');

ALTER TYPE "NotificationType" ADD VALUE 'SHIFT_BROADCAST';

ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_MARKED';
ALTER TYPE "AuditAction" ADD VALUE 'SHIFT_BROADCAST_SENT';

ALTER TABLE "shift_assignments"
  ADD COLUMN "attendance" "AttendanceStatus",
  ADD COLUMN "attendanceNote" TEXT,
  ADD COLUMN "attendanceMarkedAt" TIMESTAMP(3),
  ADD COLUMN "attendanceMarkedById" TEXT;

ALTER TABLE "shift_assignments"
  ADD CONSTRAINT "shift_assignments_attendanceMarkedById_fkey"
  FOREIGN KEY ("attendanceMarkedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "shift_assignments_attendance_idx" ON "shift_assignments"("attendance");

ALTER TABLE "shifts"
  ADD COLUMN "reminderSentAt" TIMESTAMP(3),
  ADD COLUMN "broadcastAt" TIMESTAMP(3);

CREATE TABLE "push_subscriptions" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "endpoint"   TEXT NOT NULL,
  "p256dh"     TEXT NOT NULL,
  "auth"       TEXT NOT NULL,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
