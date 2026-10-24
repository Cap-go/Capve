import { billingEmails } from "./billing-emails";
import type { Env } from "../types";
import { runRetention } from "../lib/retention";
import { automationJob } from "./alerts";
import { syncAllSourceCosts } from "./cost-sync";

/** One unit of scheduled work. */
export type ScheduledJob = {
  name: string;
  run: (env: Env, controller: ScheduledController) => Promise<unknown>;
};

/**
 * Scheduled jobs, keyed by cron expression. Keys must match `[triggers] crons` in
 * wrangler.toml (top level and env.production). To add a job: create
 * worker/cron/<job>.ts exporting a ScheduledJob and list it under its cron below.
 * `runScheduled` is the Worker's single `scheduled` handler.
 */
export const CRON_JOBS: Record<string, ScheduledJob[]> = {
  // Every 15 minutes: automation rules (zone blacklist, ROI/spend alerts).
  "*/15 * * * *": [automationJob, { name: "billing-emails", run: (env) => billingEmails(env) }],
  // Hourly: pull today's and yesterday's spend from traffic source cost APIs (Adcash, ...).
  "17 * * * *": [{ name: "cost-sync", run: (env) => syncAllSourceCosts(env) }],
  // Daily: postback delivery log pruning and optional raw click retention.
  "17 3 * * *": [{ name: "retention", run: (env) => runRetention(env) }],
};

export async function runScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  for (const job of CRON_JOBS[controller.cron] ?? []) {
    ctx.waitUntil(
      job.run(env, controller).catch((err) => {
        console.error(`[cron] ${job.name} failed`, err);
      }),
    );
  }
}
