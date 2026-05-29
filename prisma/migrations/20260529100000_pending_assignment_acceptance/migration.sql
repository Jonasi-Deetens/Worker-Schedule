-- Direct assignment now proposes a shift to the worker instead of instantly
-- confirming it: the assignment lands in PENDING_ACCEPTANCE and the worker must
-- accept (or decline) it themselves. Mirrors the reschedule reconfirmation flow.

ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'PENDING_ACCEPTANCE';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SHIFT_ASSIGNMENT_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SHIFT_ASSIGNMENT_DECLINED';
