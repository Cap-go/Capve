# Hosted billing setup

Billing is opt-in with `BILLING_ENABLED = "true"`. Self-hosted installs leave it unset and keep unrestricted reports. The landing page advertises hosted plans at capve.app. This PR does not deploy or change production data.

## Plans

| Plan | USD/month | Click allowance per UTC calendar month |
| --- | --- | --- |
| Starter | $74.50 | 1,000,000 |
| Pro | $149.50 | 60,000,000 |

Prices are half Binom v2's $149 and Binom Cloud's $299 monthly prices, checked at https://binom.org/price on October 24, 2026. These are price comparisons, not equal traffic allowances. Capve allowances are product choices and should be reviewed before launch. Every recorded click counts, including bots, across all campaigns owned by the account. The allowance resets on the first of each month UTC, independently of the Stripe invoice date. There are no overage charges or traffic interruptions.

New accounts get 14 days from registration. Existing accounts get 14 days from migration. Choosing Pro at signup starts the trial on Pro's allowance. A trial does not require a card. Checkout during a trial preserves the remaining trial in Stripe. Stripe requires at least 48 hours for Checkout subscription trials, so checking out in the last two days grants up to 48 extra hours. Stripe trialing access uses the confirmed trial end. D1 courtesy trials longer than Stripe's 730-day maximum stay in D1; those users can subscribe closer to expiry.

After trial expiry, an active or trialing Stripe subscription with an unexpired period restores reports. Past-due, unpaid, canceled, unknown-price and expired subscriptions do not grant access after the courtesy trial. Cancel-at-period-end keeps access until that paid period ends. Above the allowance, reports lock even for subscribers until upgrade or the next month's reset. Redirects, LP clicks, postbacks, the conversion API, and campaign editing continue. Reports, raw logs and CSV exports return HTTP 402, including through MCP. Raw-click retention does not reduce the durable usage ledger.

## Stripe, before enabling billing

Live resources are already created in **CodepushGo, LLC** (`acct_1UUFFLPth1byRSsb`), October 25, 2026. Do not duplicate them:

| Resource | ID |
| --- | --- |
| Starter Product / monthly USD 74.50 Price | `capve_starter` / `price_1UUFc0Pth1byRSsbw73wF7yf` |
| Pro Product / monthly USD 149.50 Price | `capve_pro` / `price_1UUFcCPth1byRSsbOwrw6lvS` |
| Capve portal configuration | `bpc_1UUFeHPth1byRSsb0svtijZb` |
| Webhook endpoint (disabled pending launch) | `we_1UUFfqPth1byRSsblazybdxg` |

Production Price IDs and portal configuration are committed in `wrangler.toml`. **Billing and automatic tax remain explicitly disabled.** Self-hosters supply their own account's resources. Local development and CI must use mocks or separate sandbox resources; never use these live IDs with sandbox keys.

1. Create a restricted runtime API key in Stripe's Dashboard. Allow Customer write, Checkout Session write (including retrieval/expiration), Subscription read and Customer Portal Session write. Verify dependencies and permissions with sandbox Checkout, subscription retrieval and portal creation before launch. The Stripe MCP OAuth connection configures the merchant account but cannot issue or install a Worker runtime key.
2. Set Worker secrets using `bunx wrangler secret put STRIPE_SECRET_KEY --env production` and `bunx wrangler secret put STRIPE_WEBHOOK_SECRET --env production`. Retrieve this endpoint's signing secret in Stripe Workbench. Enter secrets privately, never in git or chat. Keep CI/deploy credentials at Cap-go org level.
3. Review and merge this integration, then Martin deploys through the normal workflow. The endpoint URL is `https://capve.app/api/billing/webhook`, API version `2026-09-30.endive`. Enable the existing endpoint after the handler and secrets are ready. It subscribes to `customer.subscription.created`, `.updated`, `.deleted`; `checkout.session.completed`, `.async_payment_succeeded`, `.async_payment_failed`; and `invoice.paid`, `.payment_failed`, `.payment_action_required`, `.finalization_failed`.
4. Configure Stripe payment recovery emails, failed-payment retries and operational notifications. Capve logs event/account/subscription references for invoice failures and action/finalization issues. Bento's existing cron sends subscription/report-access notices; it does not send a separate email for each invoice attempt. Monitor Stripe Workbench failed deliveries and Worker warnings. Refunds, disputes and fraud warnings require operator review in Stripe; Capve does not automatically refund, cancel or interrupt tracking in response.
5. Complete the sandbox verification below, Bento setup and delayed-rollout trial correction. Confirm Medialab's stored date. Only then set `BILLING_ENABLED = "true"` for Martin's activation deployment.

The Capve portal allows billing address/name/email/tax-ID updates, payment method changes, invoice history/downloads, and switching only between Capve's two prices. Upgrades are prorated and invoiced immediately; downgrades and cancellations take effect at period end. Plan changes during a trial preserve the trial. Subscription Billing generates invoices automatically; do not create a second invoice for a subscription charge.

Checkout collects a billing address and business tax ID, saves the Customer's address/name, uses flexible subscription billing and preserves the existing remaining trial. The signed webhook retrieves current subscription state before updating access. A paid invoice, Checkout completion, or success redirect alone cannot unlock reporting. Invoice/Checkout reconciliation does not advance the subscription-event timestamp, so those independent event streams cannot suppress later subscription updates. Migration 0028 adds a separate reconciliation revision: every successful webhook update increments it, and handlers retry if another handler has changed the revision since they read the account. This also prevents invoice/Checkout snapshots from overwriting one another. Apply the migration before deploying the updated handler.

### Legal links and merchant identity

The live Capve portal links to `https://capve.app/privacy` and `https://capve.app/terms`. The website's shared footer also links to `/imprint`; all three pages reuse the company details in `src/pages/Legal.tsx`.

Stripe's account record identifies **CodepushGo, LLC**, a US LLC, at 131 Continental Dr, Suite 305, Newark, DE 19713, United States. The confirmed public support contact is `support@capgo.app`, telephone `+17759865200`. The website's Privacy Policy, Terms and imprint use these details; the earlier Digital Shift OÜ details were incorrect. No registration or tax identification number is published because Stripe did not return one.

The account business profile already names Capve and links to `https://capve.app/`. The current statement descriptor and card prefix are still `CAPGO`, and the account support URL is empty. The exposed MCP operations can read these account settings but do not provide an account-update operation; update the descriptor to `CAPVE` and support URL in the authenticated Dashboard before activation. Account-level Checkout policy URLs also require Dashboard review; the dedicated portal policy links are configured and verified separately.

Stripe currently reports charges/payouts enabled, but its requirements list contains outstanding Atlas formation fields. Do not treat those as completed verification: review them in Stripe's Dashboard. Do not invent officers, share counts, formation elections or terms acceptance values. Billing and automatic tax remain disabled; no account legal identity, tax origin, bank details or formation data were changed by this update.

### Tax activation

Stripe Tax Settings already have an active head-office configuration and account default tax code. No tax registrations were recorded when inspected. The existing account-wide settings were preserved. Both new Prices have unspecified tax behavior and the Products inherit the existing account tax category; confirm that classification and tax-inclusive/exclusive treatment before collecting tax. Creating these resources does not establish tax compliance.

Keep `STRIPE_AUTOMATIC_TAX = "false"` until the merchant confirms its actual registrations, product category and advertised price tax treatment. Recording a registration in Stripe does not register the business with a tax authority. Once confirmed, add the appropriate existing registrations, validate a sandbox tax calculation and its `taxability_reason`, then enable automatic tax in a separate reviewed deployment. No registration was invented or added by this setup.

## Existing-account activation and delayed rollout

Prepare Stripe and Bento before applying the billing migrations, then enable billing in the same launch window so existing owners receive their full 14 days. New accounts keep their signup-based trial dates.

Migration 0024 captures the pre-billing account IDs in `billing_rollout_accounts`. If deployment happens before setup is ready, keep billing disabled and run the one-time corrective migration `scripts/reset-rollout-trials.sql` immediately before first activation. Do this for any delay that would shorten existing owners' usable trial, and always if the original 14-day window has expired.

First review the exact affected accounts:

```sql
SELECT u.id, u.email, b.trial_started_at, b.trial_ends_at
FROM account_billing b JOIN users u ON u.id = b.account_id
JOIN billing_rollout_accounts r ON r.account_id = b.account_id
WHERE b.stripe_subscription_id IS NULL
  AND b.trial_ends_at - b.trial_started_at = 14 * 86400000;
```

After reviewing that cohort, Martin applies the correction using:

```sh
bunx wrangler d1 execute velo-db --remote --env production --file scripts/reset-rollout-trials.sql
```

The SQL returns the affected IDs and new dates. Verify those dates, then enable billing immediately. It resets only unsubscribed accounts in the frozen cohort that still have the standard 14-day duration. Medialab's three-year trial and other custom-duration overrides are preserved; accounts registered after migration are excluded. This is a one-time launch operation: running it again restarts eligible trials again, so do not add it to routine deployment. If an earlier version of migration 0024 was already applied without the cohort table, reconstruct the cohort from the original deployment's account snapshot and review its IDs before running this correction; do not infer membership from display names.

## Medialab's three-year trial

Medialab's confirmed account is `usr_f26ae7acc0337df4`, owned by `team.mediapath@gmail.com`.

Migration `0025_medialab_trial.sql` sets its trial start to the migration time and its end to three calendar years later. Both ID and email must match. It does not change other accounts or the plan's click allowance. The migration runs once through the normal deployment workflow. No production account has been modified by this PR.

After deployment, verify the stored trial end for this account before enabling billing. Review whether Medialab needs Pro's allowance before enabling enforcement.

For any later, explicitly authorized extension, `scripts/extend-trial.mjs` accepts an exact reviewed account ID. It defaults to local D1; `--remote` explicitly targets production. It exits nonzero if the account does not exist. Running it again grants a fresh three years, so it is not part of routine deployment.

This date override survives deployments. Reminder scheduling uses the stored interval, so Medialab's midpoint is around 18 months, not day 7. Extending a trial changes its event keys and suppresses old expiry schedules because Bento flows below have no delayed steps.

## Verification checklist

- Use Stripe test mode and a test account. Verify Starter and Pro signup, email verification, Checkout, webhook confirmation, portal upgrades, cancellation at period end, failed payment and recovery.
- Send an invalid webhook signature and confirm HTTP 400. Replay an older event and verify current subscription state wins. A success redirect alone must not unlock reports.
- Set trial expiry in the test DB. Confirm charts, logs, CSV and MCP report calls return 402 while `/r`, `/c`, `/lp`, `/click`, and convert continue recording.
- Cross the allowance, upgrade, and verify reports unlock after webhook confirmation. Verify next UTC month's allowance resets without restarting an expired trial.
- Confirm selected team accounts use the owner's subscription and allowance. Only a verified owner session can open Checkout or the portal; team members, API tokens and support impersonation cannot.
- Confirm Bento receives each event and sends the configured email, including recovery after an API failure. Trial email cron runs every 15 minutes in separate invocations, reserves a 50-query D1 budget including lease, page, cursor, event delivery and failure recovery writes, and persists its cursor. It reads pages of up to 50 owners but processes at most three per invocation under the conservative per-account reservation. Delivery timing depends on the full scan duration.
