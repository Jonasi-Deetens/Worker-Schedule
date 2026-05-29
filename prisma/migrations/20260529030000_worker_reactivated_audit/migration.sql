-- Distinguish reactivating a worker from suspending one in the audit trail.

ALTER TYPE "AuditAction" ADD VALUE 'WORKER_REACTIVATED';
