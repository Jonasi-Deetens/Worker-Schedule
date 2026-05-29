/** Payload enqueued when a user requests GDPR hard-deletion of their data. */
export interface GdprPurgeJob {
  userId: string;
}

export type GdprPurgeEnqueue = (job: GdprPurgeJob) => Promise<void>;

/**
 * Retention/safety window between a deletion request and the irreversible
 * purge. The account is suspended (soft-deleted) immediately; the purge runs
 * only after this window so an accidental request can still be reversed.
 */
export const GDPR_RETENTION_DAYS = 90;

/**
 * Lazily imports pg-boss so unit tests never open a Postgres connection. The
 * purge is delayed by the retention window via `startAfter`.
 */
export const defaultEnqueueGdprPurge: GdprPurgeEnqueue = async (job) => {
  const { getQueue, JOBS } = await import("@/infrastructure/jobs/queue");
  const boss = await getQueue();
  await boss.send(JOBS.GDPR_PURGE, job, {
    startAfter: GDPR_RETENTION_DAYS * 86_400,
    retryLimit: 5,
    retryDelay: 3_600,
    retryBackoff: true,
  });
};
