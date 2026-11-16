import type { Env } from "../types";
import { bentoConfigured, bentoRequest } from "../lib/bento";
import { onboardingSnapshot } from "../lib/onboarding";

/** Three accounts per invocation keeps even failure recovery below 50 D1 queries. */
export async function onboardingEmails(env: Env, now = Date.now()) {
  if (env.ONBOARDING_EMAILS_ENABLED !== "true" || !bentoConfigured(env)) return;
  const started = Date.now();
  const lease = crypto.randomUUID();
  const progress = await env.DB.prepare(`UPDATE onboarding_email_progress SET lease_token = ?, lease_until = ?
    WHERE id = 1 AND lease_until <= ? RETURNING cursor`)
    .bind(lease, started + 5 * 60_000, started).first<{ cursor: string }>();
  if (!progress) return;
  let cursor = progress.cursor;
  try {
    const page = await env.DB.prepare(`SELECT u.id, u.email FROM users u
      JOIN account_onboarding o ON o.account_id = u.id
      WHERE u.id > ? AND u.email_verified = 1 AND o.email_tips = 1 AND o.dismissed = 0
      AND NOT EXISTS (SELECT 1 FROM onboarding_email_events e
        WHERE e.event_key = u.id || ':onboarding:completed' AND e.delivered_at IS NOT NULL)
      ORDER BY u.id LIMIT 3`).bind(cursor).all<{ id: string; email: string }>();
    let processed = 0;
    for (const user of page.results) {
      if (Date.now() - started >= 20_000) break;
      const { status, consentAt } = await onboardingSnapshot(env.DB, user.id);
      // Recheck consent after reading the page, before dispatching any event.
      if (status.emailTips && !status.dismissed && status.steps.verify && consentAt !== null) {
        const age = now - consentAt;
        const stage = status.complete ? "completed" : age >= 3 * 86400_000 ? "reminder_3d" : age >= 86400_000 ? "reminder_1d" : "welcome";
        const key = `${user.id}:onboarding:${stage}`;
        const event = await env.DB.prepare(`INSERT INTO onboarding_email_events (event_key, account_id) VALUES (?, ?)
          ON CONFLICT(event_key) DO UPDATE SET event_key = excluded.event_key
          RETURNING delivered_at`).bind(key, user.id).first<{ delivered_at: number | null }>();
        if (event?.delivered_at == null) {
          try {
            await bentoRequest(env, "events", [{
              type: `capve_onboarding_${stage}`, email: user.email,
              fields: {
                capve_account_id: user.id, capve_onboarding_complete: status.complete,
                capve_onboarding_next_step: status.nextStep ?? "complete", capve_onboarding_email_tips: true,
                capve_getting_started_url: `${env.APP_URL.replace(/\/$/, "")}/app/getting-started`,
              },
              details: { event_key: key, unique: { key } },
            }]);
            await env.DB.prepare("UPDATE onboarding_email_events SET delivered_at = ? WHERE event_key = ?")
              .bind(now, key).run();
          } catch (error) {
            console.error("[onboarding-email] Event delivery failed", { accountId: user.id, stage, error });
          }
        }
      }
      cursor = user.id;
      processed++;
      await env.DB.prepare("UPDATE onboarding_email_progress SET cursor = ? WHERE id = 1 AND lease_token = ?")
        .bind(cursor, lease).run();
    }
    if (processed === page.results.length && page.results.length < 3) cursor = "";
  } finally {
    await env.DB.prepare(`UPDATE onboarding_email_progress SET cursor = ?, lease_token = NULL, lease_until = 0
      WHERE id = 1 AND lease_token = ?`).bind(cursor, lease).run();
  }
}
