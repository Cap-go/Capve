import type { Env } from "../types";
import { syncAllSourceCosts } from "./cost-sync";

/**
 * Scheduled jobs, keyed by cron expression (must match `[triggers] crons` in wrangler.toml).
 * Add new jobs here; `runScheduled` is the Worker's single `scheduled` handler.
 */
export const CRON_JOBS: Record<string, Array<(env: Env) => Promise<unknown>>> = {
  // Hourly: pull today's and yesterday's spend from traffic source cost APIs (Adcash, ...).
  "17 * * * *": [(env) => syncAllSourceCosts(env)],
};

export async function runScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const jobs = CRON_JOBS[controller.cron] ?? [];
  ctx.waitUntil(
    Promise.allSettled(jobs.map((job) => job(env))).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") console.error("cron job failed", controller.cron, result.reason);
      }
    }),
  );
}
