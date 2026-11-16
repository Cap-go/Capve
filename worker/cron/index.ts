import { onboardingEmails } from "./onboarding-emails";
import { billingEmails } from "./billing-emails";
import { purgeOAuth } from "../lib/oauth";
import type { Env } from "../types";
import { runRetention } from "../lib/retention";
import { automationJob } from "./alerts";
import { syncAllSourceCosts } from "./cost-sync";
import { retryHostnameCleanup } from "../lib/tracking-domain-cleanup";

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
  "*/15 * * * *": [automationJob],
  "7,22,37,52 * * * *": [{ name: "onboarding-emails", run: (env) => onboardingEmails(env) }],
  // Separate invocation so billing's D1 query budget is independent of automation.
  "2,17,32,47 * * * *": [{ name: "billing-emails", run: (env) => billingEmails(env) }],
  // Hourly: pull today's and yesterday's spend from traffic source cost APIs (Adcash, ...), and
  // retry deleting Cloudflare custom hostnames left without a tracking domain.
  "17 * * * *": [
    { name: "cost-sync", run: (env) => syncAllSourceCosts(env) },
    { name: "tracking-domain-cleanup", run: (env) => retryHostnameCleanup(env) },
  ],
  // Daily: postback delivery log pruning and optional raw click retention.
  "17 3 * * *": [
    { name: "retention", run: (env) => runRetention(env) },
    { name: "oauth-retention", run: (env) => purgeOAuth(env.DB) },
  ],
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
