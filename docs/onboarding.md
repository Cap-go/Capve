# Getting started and Bento onboarding

Capve’s activation goal is a conversion attributed to a non-bot click in a real campaign. The guide is at `/app/getting-started`; signup and email verification lead there. Signing in through `/app` resumes unfinished setup unless the owner skips it. Completed accounts go to Campaigns. Explicit dashboard and campaign deep links, including legacy query links, remain usable. OAuth return URLs still take priority over the guide.

The four steps are email verification, campaign creation, a non-bot click, and an attributed conversion. Progress is read from the selected account’s real records, preferring the non-archived campaign furthest along. It does not mix clicks from one campaign with conversions from another. Rejected/reversed/fraud statuses use the same exclusions as reports; pending/lead conversions prove that ingestion works but do not prove a payout. A test conversion is sufficient to verify the integration, not profitability. The guide refreshes every 15 seconds and when the window regains focus. Archiving a campaign or removing its data can change current progress.

Traffic source setup, custom domains, team invitations, and AI/MCP are available from the guide but are not required to reach the first conversion. The guide links to the existing campaign editor, tracking link, incoming postback, logs, reports, and documentation. It never sends fake clicks or conversions or requires billing to edit campaigns. Reporting access still follows the billing rules.

`GET /api/onboarding` (MCP `get_onboarding`) returns completion booleans, the next step, and a campaign ID, with no logs, revenue or counts. Team members see the selected account’s progress. `PUT /api/onboarding` (MCP `update_onboarding`) accepts `dismissed` and/or `emailTips` booleans; only the owner outside impersonation can change them. Progress cannot be manually checked off. Preferences are stored in D1. New and existing users start without email consent; an unchecked signup checkbox or the owner’s guide checkbox records explicit consent. Skip pauses setup emails and prevents automatic redirection, while leaving the sidebar guide available.

## Martin’s deployment and Bento setup

This PR prepares the app and email content. It does not deploy, enable flows, or send real email. The connected Bento integration is for **CapGo**, so do not install these flows there. Use the separate **Capve** site.

1. Merge only after CI and review, then deploy through the existing workflow. Migration `0033_onboarding.sql` adds preferences, delivery records and a scan cursor. No existing user is subscribed by the migration.
2. Use the sender/domain verification and Worker secrets in [Bento setup](bento-emails.md): `BENTO_SITE_UUID`, `BENTO_PUBLISHABLE_KEY`, `BENTO_SECRET_KEY`. Use the Capve site’s credentials and an approved `noreply@capve.app` author; keep a monitored reply-to. Credentials remain Worker secrets, never source or browser code.
3. Create the four event-triggered workflows below in Capve, initially disabled. Each has one **immediate marketing email**, with the HTML from `docs/emails/onboarding/`. Require a subscribed recipient and exclude unsubscribed/suppressed addresses. Do not use transactional delivery or an action that resubscribes users. Include the template’s `{{ visitor.unsubscribe_url }}` footer.
4. Add an entry condition `capve_onboarding_email_tips = true`. For the welcome/reminder workflows also require `capve_onboarding_complete = false`; for completion require `true`. Disable repeat entry where supported. Deduplicate using `details.event_key` if supported. Preview every template, including its unsubscribe link, in Bento.
5. With the templates ready, add `ONBOARDING_EMAILS_ENABLED = "true"` under `[env.production.vars]` in `wrangler.toml`, merge that configuration change and deploy via the normal workflow. It is deliberately absent/off in this PR. The guide works without Bento and with billing disabled. Auth/billing workflows remain separate.
6. Test with a verified, opted-in seed account and the seed mailbox before enabling workflows for everyone. Confirm sender, links, consent, unsubscribe suppression, duplicates and the progression below. Do not enroll existing users in bulk.

| Event | When eligible | Subject | Template |
| --- | --- | --- | --- |
| `capve_onboarding_welcome` | Verified and opted in, under 24 hours since consent, incomplete | Your first conversion starts here | `docs/emails/onboarding/welcome.html` |
| `capve_onboarding_reminder_1d` | Incomplete, 24–72 hours since consent | Pick up your Capve setup | `docs/emails/onboarding/reminder-1d.html` |
| `capve_onboarding_reminder_3d` | Incomplete, at least 72 hours since consent | Connect your click to a conversion | `docs/emails/onboarding/reminder-3d.html` |
| `capve_onboarding_completed` | All four current steps complete | Your Capve tracking loop is working | `docs/emails/onboarding/completed.html` |

All emails link to `https://capve.app/app/getting-started`, where the user sees current steps and instructions. No delayed signup sequence: the backend selects only the current milestone, so late verification, delayed cron execution or completion cannot queue obsolete reminders. Welcome, each reminder, and completion are accepted at most once per account in normal operation; toggling consent does not reset delivery history. After accepted completion, the account leaves the email scan even if records are later deleted. Dismissal and email opt-out suppress future events. Bento unsubscribe is authoritative for delivery even if the app’s consent flag is still on; the app never resubscribes a recipient. Already accepted email cannot be recalled by later preference changes.

Each event contains flat profile fields `capve_account_id`, `capve_onboarding_complete`, `capve_onboarding_next_step` (`verify`, `campaign`, `click`, `conversion`, `complete`), `capve_onboarding_email_tips`, and `capve_getting_started_url`. Details contain `event_key` and `unique.key`. These profile fields are snapshots at dispatch, not a live source of truth; do not use them to run delayed campaigns.

The dedicated cron runs at minutes 7, 22, 37 and 52 and scans up to three eligible accounts per invocation, with a 20-second start budget. It uses at most 18 D1 queries (lease, page, up to five queries per account, release), separate from billing/automation budgets. A five-minute overlap lease prevents concurrent scans. The cursor advances fairly; a scan takes roughly `ceil(eligible accounts / 3) × 15 minutes`, with an extra pass to reset an exactly full last page. Failed requests retry on the next pass; failures spanning a milestone can be replaced by the current reminder. A crash after Bento accepts but before D1 records acceptance can duplicate an event. `unique.key` is not a guarantee of exactly-once marketing delivery.

## Seed acceptance checks

- Register without consent: no onboarding event. Opt in before verification: still no event. Verify: one current event, no duplicate on the next scan.
- Create a campaign; open the tracking link in a browser; use its click ID in a test postback. The guide advances only on stored data. Bot clicks, rejected conversions and another account’s data do not complete it.
- Move only the seed account’s `consent_at` back one day, then four days. Confirm the appropriate reminder and no catch-up welcome/old reminder. Complete the funnel: completion replaces further reminders.
- Opt out or skip: no future event. Unsubscribe in Bento: future marketing emails are suppressed without affecting authentication or billing notices.
- Fail a seed Bento request: no delivered timestamp; next pass retries. Run concurrent scans: one dispatch. Verify a later account is eventually visited.
- Sign in again: incomplete setup resumes, completed/skipped setup goes to Campaigns. Reopen from the sidebar and switch accounts: progress follows the selected account.

References: [Bento Events API](https://bentonow.com/docs/events_api), [Bento email setup](bento-emails.md).
