-- GDPR hard-delete lifecycle: audit a deletion request and the subsequent purge.

ALTER TYPE "AuditAction" ADD VALUE 'GDPR_DELETE_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'GDPR_PURGED';
