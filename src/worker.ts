/**
 * pg-boss worker entrypoint.
 *
 * Run with `npm run worker`. Designed to be deployed as a long-running
 * process alongside the Next.js server. Each scheduled job uses pg-boss's
 * native cron scheduling so we don't need an external cron.
 */
import { prisma } from "@/infrastructure/db/prisma";
import { getQueue, JOBS } from "@/infrastructure/jobs/queue";
import {
  runAvailabilityMaterialise,
  runDimonaDeclare,
  runDimonaReconcile,
  runInviteCleanup,
  runShiftReminders24h,
  runWebhookDelivery,
} from "@/infrastructure/jobs/handlers";
import type { DimonaDeclareJob } from "@/application/services/dimona-declare-job";
import type { WebhookDeliveryJob } from "@/application/services/webhook-service";
import { logger } from "@/infrastructure/logging/logger";

async function main() {
  const boss = await getQueue();

  boss.on("error", (err: unknown) =>
    logger.error({
      event: "jobs.error",
      error: err instanceof Error ? err.message : String(err),
    }),
  );

  await boss.work(JOBS.AVAILABILITY_MATERIALISE, async () => {
    await runAvailabilityMaterialise(prisma);
  });
  await boss.work(JOBS.SHIFT_REMINDER_24H, async () => {
    await runShiftReminders24h(prisma);
  });
  await boss.work(JOBS.INVITE_CLEANUP, async () => {
    await runInviteCleanup(prisma);
  });
  await boss.work(JOBS.DIMONA_RECONCILE, async () => {
    await runDimonaReconcile(prisma);
  });

  // Webhook delivery retries are event-driven (enqueued by WebhookService on a
  // failed inline attempt), not scheduled. The queue carries the retry policy
  // configured per-job at enqueue time.
  await boss.createQueue(JOBS.WEBHOOK_DELIVER);
  await boss.work<WebhookDeliveryJob>(JOBS.WEBHOOK_DELIVER, async (jobs) => {
    for (const job of jobs) {
      await runWebhookDelivery(prisma, job.data);
    }
  });

  await boss.createQueue(JOBS.DIMONA_DECLARE);
  await boss.work<DimonaDeclareJob>(JOBS.DIMONA_DECLARE, async (jobs) => {
    for (const job of jobs) {
      await runDimonaDeclare(prisma, job.data);
    }
  });

  await boss.schedule(JOBS.AVAILABILITY_MATERIALISE, "0 2 * * *"); // 02:00 daily
  await boss.schedule(JOBS.SHIFT_REMINDER_24H, "*/15 * * * *"); // every 15 min
  await boss.schedule(JOBS.INVITE_CLEANUP, "30 3 * * *"); // 03:30 daily
  await boss.schedule(JOBS.DIMONA_RECONCILE, "15 4 * * *"); // 04:15 daily

  logger.info({ event: "jobs.worker.started" });

  const shutdown = async () => {
    logger.info({ event: "jobs.worker.shutdown" });
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({
    event: "jobs.worker.fatal",
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
