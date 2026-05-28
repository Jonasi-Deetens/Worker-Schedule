-- Time-off lifecycle: worker cancel/edit and owner revoke audit actions.

ALTER TYPE "AuditAction" ADD VALUE 'TIMEOFF_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'TIMEOFF_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'TIMEOFF_REVOKED';
