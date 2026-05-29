-- Dimona compliance wiring: cancel/OUT declarations, reconcile gap alerting,
-- and audit actions for worker NISS and owner business-settings changes.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DIMONA_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORKER_PROFILE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BUSINESS_SETTINGS_UPDATED';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DIMONA_GAP_DETECTED';
