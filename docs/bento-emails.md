# Bento setup and copy

Configure these flows manually in the Capve Bento site. This PR does not create or activate flows in the connected Capgo Bento account.

## Sender and API

1. Create/select the Capve site. Authenticate `capve.app` DNS in Bento and add `noreply@capve.app` as an approved author. Set a monitored reply-to address in Bento.
2. Set Worker secrets `BENTO_SITE_UUID`, `BENTO_PUBLISHABLE_KEY`, and `BENTO_SECRET_KEY` with `bunx wrangler secret put NAME --env production`. Do not put them in git. The client uses Basic auth, a server-side User-Agent, and site_uuid on `/api/v1/batch/events` and `/api/v1/batch/emails`.
3. When all three are set, password reset, email verification and operational alert emails use Bento's transactional API. Existing Cloudflare EMAIL remains a fallback for self-hosted installs with no Bento configuration. Auth mail is sent immediately, not through a sequence. Do not create a second verification or reset flow. Authentication emails include per-send directives disabling click rewriting, open tracking, and UTMs.
4. Lifecycle scans run at minutes 2, 17, 32 and 47 of each hour when billing is enabled, in a separate invocation from automation. Each invocation processes at most 50 verified accounts and stops starting another account after 20 seconds. D1 stores the scan cursor and an overlap lease. A complete scan takes approximately `ceil(verified accounts / 50) × 15 minutes`, or longer if the time budget stops a batch early. They only target verified account owners, not team members. This means an unverified signup may not get a trial email until verification. The trial clock still starts at signup.

## Fields

Each event updates these flat subscriber fields:

- `capve_account_id`
- `capve_plan`, `starter` or `pro`
- `capve_trial_ends_at`, ISO timestamp
- `capve_reports_allowed`, boolean snapshot when the event was emitted
- `capve_subscription_status`, Stripe status or `none`
- `capve_click_limit`
- `capve_monthly_clicks`
- `capve_billing_url`

The event details include `event_key`, `period` and `unique.key`. D1 stores delivery acceptance and leases to avoid concurrent sends. Failed deliveries retry when the scan next reaches that account. A timeout after Bento accepts an event can still cause a retry; add a Bento guard against the same event_key where supported. Do not assume purchase-unique-event reporting guarantees exactly-once workflow email delivery.

## Flow rules

Create one event-triggered flow per event below, containing one immediate email. If Bento requires a sequence, make one single-email sequence per flow with zero delay. Do not create a day-7/day-11 delayed sequence from signup. Capve emits reminders at the correct time using the actual trial dates, including courtesy extensions. A cron delayed across multiple milestones emits only the currently relevant notice rather than sending obsolete reminders together.

For trial-related flows, add a condition excluding `capve_subscription_status = active`. The backend also suppresses these notices for active paid subscriptions. The halfway event occurs at 50% of the stored trial interval, ending occurs within the final three days, and expiry occurs after the stored end. Each milestone is accepted once per account/trial-end combination. Ongoing subscription/traffic notices have their own keys. Do not add promotional follow-ups to these service notices. Optional onboarding tips belong in a separate opt-in marketing flow with an unsubscribe link.

The copy below deliberately uses fixed links, so it can be pasted without custom field Liquid syntax. Preview and test against a seed address before enabling each flow. Use a simple HTML/text template and Bento's standard footer. Receipts and card charge timing come from Stripe.

## Trial started

Event: `capve_trial_started`

Subject: Your Capve trial is ready

```text
Your Capve trial has started. You can create campaigns, route traffic, and view reports.

Start by adding a campaign and copying its tracking link:
https://capve.app/app

Your exact trial end date and monthly click allowance are shown in Billing:
https://capve.app/app?entity=billing

No card is required for the trial. When it ends, reports will lock unless you subscribe. Tracking links, clicks, and conversions keep working.

The Capve team
```

## Trial halfway

Event: `capve_trial_midway`

Subject: You're halfway through your Capve trial

```text
You're halfway through your Capve trial.

Check your campaign reports and confirm that your network's postbacks are recording conversions:
https://capve.app/app

To keep reports available after your trial, choose a plan in Billing. You'll find your exact trial end date there too:
https://capve.app/app?entity=billing

Your traffic will keep running even if you decide later.

The Capve team
```

## Trial ending

Event: `capve_trial_ending`

Subject: Your Capve trial ends within three days

```text
Your Capve trial ends within three days. Choose a plan to keep viewing campaign reports.

Review your trial end date and choose a plan:
https://capve.app/app?entity=billing

If you don't subscribe, reports will lock at the end of your trial. Traffic will keep redirecting, and clicks and conversions will keep recording.

The Capve team
```

## Trial ended

Event: `capve_trial_expired`

Subject: Your Capve trial has ended

```text
Your Capve trial has ended. An active subscription is now required to view reports.

Your tracking links still work. Capve continues recording clicks and conversions.

Choose a plan to restore reports. If you also exceeded your monthly allowance, choose a larger plan or wait for the next month's reset:
https://capve.app/app?entity=billing

The Capve team
```

## Traffic allowance exceeded

Event: `capve_traffic_limit_reached`

Subject: Your Capve monthly click allowance has been exceeded

```text
Your account has exceeded its monthly click allowance, so reports are locked.

Your traffic is still running, and Capve continues recording clicks and conversions. There are no automatic overage charges.

Upgrade your plan to restore reports, or wait until the first of next month UTC for your allowance to reset. Reports also require an active trial or subscription.

Review your usage and plan:
https://capve.app/app?entity=billing

The Capve team
```

## Subscription active

Event: `capve_subscription_active`

Subject: Your Capve subscription is active

```text
Your Capve subscription is active. Reports are available within your plan's monthly click allowance.

View your plan or manage your subscription:
https://capve.app/app?entity=billing

Stripe sends your receipt separately. Your campaign tracking continues as usual.

The Capve team
```

## Payment failed

Event: `capve_payment_failed`

Subject: Update your payment method for Capve

```text
Your Capve subscription needs a payment update.

Open Billing, then choose Manage subscription to update your payment method:
https://capve.app/app?entity=billing

Reports require an active trial or subscription and available click allowance. Your traffic keeps running while you resolve payment.

The Capve team
```

## Subscription canceled

Event: `capve_subscription_canceled`

Subject: Your Capve subscription has ended

```text
Your Capve subscription has ended. An active trial or subscription is required to view reports.

Your tracking links still redirect traffic, and Capve keeps recording clicks and conversions.

You can subscribe again here:
https://capve.app/app?entity=billing

The Capve team
```

## Seed checks before enabling

Use a verified test account and a Bento test mailbox. Confirm the trial-start event arrives after verification, then move that test account's dates to each milestone. Confirm there is one email for each current milestone, none on the next cron, and no outdated trial mail once the paid subscription is active. Test a three-year trial and confirm day 7 does not trigger its halfway email. Test exceeded usage and payment failure separately. Keep all flows immediate so a later trial extension cannot leave queued expiry mail behind.

References: [Bento authentication](https://bentonow.com/docs/authentication), [events](https://bentonow.com/docs/events_api), [emails](https://bentonow.com/docs/emails_api).
