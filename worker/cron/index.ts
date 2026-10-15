import type { Env } from "../types";
import { automationJob } from "./alerts";

/**
 * Scheduled work. Every job runs on every cron trigger (see `[triggers]` in wrangler.toml);
 * a job that needs a slower cadence can check `controller.cron` / `controller.scheduledTime`.
 * To add a job: create worker/cron/<job>.ts exporting a ScheduledJob and append it below.
 */
export type ScheduledJob = {
  name: string;
  run: (env: Env, controller: ScheduledController) => Promise<unknown>;
};

export const SCHEDULED_JOBS: ScheduledJob[] = [automationJob];

export async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  for (const job of SCHEDULED_JOBS) {
    ctx.waitUntil(
      job.run(env, controller).catch((err) => {
        console.error(`[cron] ${job.name} failed`, err);
      }),
    );
  }
}
