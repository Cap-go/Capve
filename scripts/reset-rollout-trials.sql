-- One-time corrective migration, immediately before first billing activation.
-- Review the matching cohort first; rerunning restarts these trials again.
-- Preserve subscriptions and every trial override with a different duration.
UPDATE account_billing
SET trial_started_at = unixepoch() * 1000,
    trial_ends_at = (unixepoch() + 14 * 86400) * 1000
WHERE account_id IN (SELECT account_id FROM billing_rollout_accounts)
  AND stripe_subscription_id IS NULL
  AND trial_ends_at - trial_started_at = 14 * 86400000
RETURNING account_id, trial_started_at, trial_ends_at;
