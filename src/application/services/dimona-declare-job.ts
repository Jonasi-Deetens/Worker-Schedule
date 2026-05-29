/** Payload enqueued when a live Dimona declaration fails and should be retried. */
export interface DimonaDeclareJob {
  shiftId: string;
  workerId: string;
  action: "IN" | "OUT" | "CANCEL";
  declarationId?: string;
}

export type DimonaDeclareEnqueue = (job: DimonaDeclareJob) => Promise<void>;

/**
 * Lazily imports pg-boss so unit tests never open a Postgres connection.
 * Failed declarations retry with bounded exponential backoff (up to 5 attempts).
 */
export const defaultEnqueueDimonaDeclare: DimonaDeclareEnqueue = async (job) => {
  const { getQueue, JOBS } = await import("@/infrastructure/jobs/queue");
  const boss = await getQueue();
  await boss.send(JOBS.DIMONA_DECLARE, job, {
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
  });
};
