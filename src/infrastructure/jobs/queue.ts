import { PgBoss } from "pg-boss";

type PgBossInstance = InstanceType<typeof PgBoss>;

/**
 * Single shared pg-boss instance. We lazily construct it so importing this
 * module from a test does not open a Postgres connection.
 *
 * `DATABASE_URL` is reused for the queue; pg-boss creates its own schema on
 * first start.
 */
let bossPromise: Promise<PgBossInstance> | null = null;

export function getQueue(): Promise<PgBossInstance> {
  if (!bossPromise) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL must be set to start the job queue");
    }
    bossPromise = (async () => {
      const instance = new PgBoss({ connectionString: url, schema: "pgboss" });
      await instance.start();
      return instance;
    })();
  }
  return bossPromise;
}

/** Stable job name registry to keep producers and workers in sync. */
export const JOBS = {
  AVAILABILITY_MATERIALISE: "availability.materialise",
  SHIFT_REMINDER_24H: "shift.reminder.24h",
  INVITE_CLEANUP: "invite.cleanup",
  DIMONA_RECONCILE: "dimona.reconcile",
  DIMONA_DECLARE: "dimona.declare",
  WEBHOOK_DELIVER: "webhook.deliver",
  GDPR_PURGE: "gdpr.purge",
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];
