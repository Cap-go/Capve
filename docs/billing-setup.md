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

1. Select the Stripe account that owns Capve. Start in test mode, then repeat the setup in live mode. Keep test and live IDs/keys separate.
2. Create two products, `Capve Starter` and `Capve Pro`, with **monthly recurring USD prices**, $74.50 and $149.50. Do not create usage-based prices or overage charges. Trial timing comes from Capve, not a second 14-day Stripe promotion.
3. In Stripe's customer portal settings, allow payment method updates, cancellation at period end, and switching between these two prices. Apply plan changes immediately with proration so an upgrade restores reports on the confirmed subscription update. Disable unrelated prices and quantities. Keep payment collection enabled for trial Checkout.
4. Add webhook `https://capve.app/api/billing/webhook` for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Select the API version matching the installed Stripe SDK, currently 2026-09-30.endive. The handler verifies the raw payload signature, then retrieves the current subscription before updating D1. Do not use a Checkout success redirect as proof of payment.
5. Set Worker secrets with `bunx wrangler secret put NAME --env production` for `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Never paste them into chat or git. Keep CI/deploy credentials at Cap-go org level.
6. Set non-secret production vars `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_PRO` to the two price IDs. Add `BILLING_ENABLED = "true"` only after Stripe and Bento setup is complete. These vars must be included in `env.production.vars` in wrangler.toml for later deployments to retain them.
7. Apply migrations through the normal deployment workflow after review and merge. Before launch, follow the Medialab steps below. Martin performs deployment; agents must not deploy.

Stripe prices are the charging source of truth. Verify that the configured IDs are the correct account, currency, amount and monthly interval. Changing `shared/billing.ts` alone does not change Stripe charges. Configure Stripe's failed-payment retries and receipts; Capve sends the reporting-access notices through Bento.

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
- Confirm Bento receives each event and sends the configured email, including recovery after an API failure. Trial email cron runs every 15 minutes in separate invocations, processes at most 50 verified owners per invocation, and persists its cursor. Delivery timing depends on the full scan duration.
