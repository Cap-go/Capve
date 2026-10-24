import type { Env } from "../types";
import { bentoConfigured, bentoRequest } from "../lib/bento";
import { billingRow, billingStatus } from "../lib/billing";

// At most two event types per account: a lifecycle notice and an overage notice.
// 50 accounts use at most 600 D1 queries, plus fixed cursor/lease overhead.
export const BILLING_EMAIL_BATCH_SIZE = 50;
const RUN_BUDGET_MS = 20_000;

/** Event scheduling uses the stored trial dates, including manual extensions. */
export async function billingEmails(env: Env, now = Date.now()) {
  if (env.BILLING_ENABLED !== "true" || !bentoConfigured(env)) return;
  const startedAt = Date.now();
  const lease = crypto.randomUUID();
  const progress = await env.DB.prepare(`UPDATE billing_email_progress SET lease_token = ?, lease_until = ?
    WHERE id = 1 AND lease_until <= ? RETURNING cursor`)
    .bind(lease, startedAt + 5 * 60_000, startedAt).first<{ cursor: string }>();
  if (!progress) return;
  let cursor = progress.cursor;
  try {
    const page = await env.DB.prepare("SELECT id, email FROM users WHERE id > ? AND email_verified = 1 ORDER BY id LIMIT ?")
      .bind(cursor, BILLING_EMAIL_BATCH_SIZE).all<{ id: string; email: string }>();
    let processed = 0;
    for (const user of page.results) {
      if (Date.now() - startedAt >= RUN_BUDGET_MS) break;
      const row = await billingRow(env, user.id);
      const status = await billingStatus(env, user.id, now);
      const subscribed = status.subscriptionStatus === "active";
      const trialKey = String(row.trial_ends_at);
      const events: Array<{ type: string; cycle: string }> = [];
      if (!subscribed && (!row.stripe_subscription_id || row.subscription_status === "trialing")) {
        const midpoint = row.trial_started_at + (row.trial_ends_at - row.trial_started_at) / 2;
        if (now < midpoint) events.push({ type: "capve_trial_started", cycle: trialKey });
        else if (now < row.trial_ends_at - 3 * 86400_000) events.push({ type: "capve_trial_midway", cycle: trialKey });
        else if (now < row.trial_ends_at) events.push({ type: "capve_trial_ending", cycle: trialKey });
        else events.push({ type: "capve_trial_expired", cycle: trialKey });
      }
      if (row.stripe_subscription_id && row.subscription_status === "active")
        events.push({ type: "capve_subscription_active", cycle: row.stripe_subscription_id });
      if (row.stripe_subscription_id && ["past_due", "unpaid"].includes(row.subscription_status ?? ""))
        events.push({ type: "capve_payment_failed", cycle: `${row.stripe_subscription_id}:${status.period}` });
      if (row.stripe_subscription_id && row.subscription_status === "canceled")
        events.push({ type: "capve_subscription_canceled", cycle: row.stripe_subscription_id });
      if (status.reason === "traffic_limit") events.push({ type: "capve_traffic_limit_reached", cycle: status.period });
      for (const event of events) {
        const key = `${user.id}:${event.type}:${event.cycle}`;
        await env.DB.prepare("INSERT OR IGNORE INTO billing_email_events (event_key, account_id, event_type) VALUES (?, ?, ?)")
          .bind(key, user.id, event.type).run();
        const claim = await env.DB.prepare(`UPDATE billing_email_events SET claimed_until = ?
          WHERE event_key = ? AND delivered_at IS NULL AND claimed_until <= ? RETURNING event_key`)
          .bind(now + 5 * 60_000, key, now).first();
        if (!claim) continue;
        try {
          await bentoRequest(env, "events", [{
            type: event.type, email: user.email,
            fields: {
              capve_account_id: user.id, capve_plan: status.plan,
              capve_trial_ends_at: new Date(row.trial_ends_at).toISOString(),
              capve_reports_allowed: status.reportsAllowed, capve_subscription_status: status.subscriptionStatus ?? "none",
              capve_click_limit: status.clickLimit, capve_monthly_clicks: status.clicks,
              capve_billing_url: `${env.APP_URL}/app?entity=billing`,
            },
            details: { event_key: key, period: status.period, unique: { key } },
          }]);
          await env.DB.prepare("UPDATE billing_email_events SET delivered_at = ? WHERE event_key = ?").bind(now, key).run();
        } catch (error) {
          await env.DB.prepare("UPDATE billing_email_events SET claimed_until = 0 WHERE event_key = ?").bind(key).run();
          console.error("[billing-email] Event delivery failed", { accountId: user.id, event: event.type, error });
        }
      }
      cursor = user.id;
      processed++;
      await env.DB.prepare("UPDATE billing_email_progress SET cursor = ? WHERE id = 1 AND lease_token = ?")
        .bind(cursor, lease).run();
    }
    if (processed === page.results.length && page.results.length < BILLING_EMAIL_BATCH_SIZE) cursor = "";
  } finally {
    await env.DB.prepare(`UPDATE billing_email_progress SET cursor = ?, lease_token = NULL, lease_until = 0
      WHERE id = 1 AND lease_token = ?`).bind(cursor, lease).run();
  }
}
