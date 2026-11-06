# Capve Stripe integration plan and setup receipt

Prepared October 25, 2026 with the official Stripe plugin and Stripe MCP implementation planner. Account and runtime staging rechecked November 6, 2026.

Merchant: **CodepushGo, LLC**, `acct_1UUFFLPth1byRSsb` (live).
Planner guide: `iguide_61VddRyaTF2bIbtbp41Pth1byRSsb`; accepted hosted subscription Checkout blueprint: `bp_fcb608d2a120`.

## Implemented plan

Use server-created hosted Checkout Sessions for fixed monthly subscriptions, flexible billing mode, and a dedicated customer portal for plan changes, payment methods, billing details and invoice downloads. Subscription Billing generates recurring invoices. Starter is USD 74.50/month (1M clicks per UTC month); Pro is USD 149.50/month (60M clicks). No metered charges or overage invoices.

The implementation preserves verified owner authorization, D1 trial dates, idempotent Customer/Checkout creation, signed webhooks, current-subscription reconciliation, successor guards and continuous tracking while reporting is locked. Invoice and Checkout events reconcile current state without granting access based on those events alone or advancing the subscription-event watermark. Tax address and business ID collection are enabled in Checkout. Automatic tax remains a separate opt-in setting.

## Live setup completed

- Products `capve_starter` and `capve_pro` and their default monthly Prices are active.
- Dedicated Capve portal `bpc_1UUFeHPth1byRSsb0svtijZb` is active, with invoice history, billing/payment updates, prorated upgrades, period-end downgrades and period-end cancellation. This was the first portal configuration on the account, so Stripe also marked it as the default; Capve explicitly selects it by ID.
- Replacement webhook `we_1UYnLwPth1byRSsbKJut6qQf` is created for the production URL and installed SDK API version. Its signing secret is staged in Cloudflare; the endpoint stays disabled until deployment. The previous endpoint remains disabled and is marked superseded.
- Resource IDs are recorded in [billing setup](billing-setup.md) and production config. Billing remains disabled.

## Remaining activation requirements

The privately supplied runtime key and replacement signing secret are encrypted bindings in an unpublished Cloudflare Worker version. Martin performs production deployment and activation after the remaining checks, as required by AGENTS.md. No payments, Customers, subscriptions, refunds or tax registrations were created, and no Worker was deployed by this setup.

No active Tax registrations were recorded in Stripe. Existing merchant origin and tax defaults were preserved. Merchant confirmation of actual registrations, product category and price tax treatment is required before automatic tax activation. Sandbox coverage and an actual tax calculation are required before launch; mocked tests do not establish live tax collection.

Configure Smart Retries, Stripe payment emails and operational alerts in the Dashboard. Bento remains responsible for Capve trial and reporting-access notices. Operators handle refund/dispute/fraud decisions in Stripe. See the full activation and verification checklist in [billing setup](billing-setup.md).

## Legal information follow-up

Stripe's `company.name` confirms CodepushGo, LLC. Its US company address and public support email/phone are the source for the website's Privacy Policy, Terms and new imprint. The previous Digital Shift OÜ details were incorrect and have been removed from the legal pages. No company registration number or tax identifier was inferred or published. Estonia-specific establishment, retention and exclusive-court claims were removed; applicable-law and mandatory consumer rights wording remains.

The live Capve portal now links to the Privacy Policy at `https://capve.app/privacy` and Terms at `https://capve.app/terms`. Account-level review also found the `CAPGO` statement descriptor, an empty support URL and outstanding Atlas requirements. The merchant's own API key cannot change these account-level settings either: Stripe rejected that update because the Account API only edits connected accounts. Both Products now specify `CAPVE` for subscription statements, while the account prefix still needs Dashboard review. See [billing setup](billing-setup.md) for the verified findings and activation requirements.

## Runtime configuration receipt, November 6, 2026

- Reauthorized the existing **Capve** account `acct_1UUFFLPth1byRSsb`; confirmed country `US`, currency `usd`, charges enabled and payouts enabled. No new merchant account was created.
- Verified the private API key belongs to this exact account before using it. Verified both existing monthly Prices, their amounts and the dedicated portal's invoice/plan/legal-link configuration.
- Updated both subscription Products' statement descriptor to `CAPVE`. Account-wide descriptor and support URL changes were attempted with the supplied key but rejected by Stripe because its Account update endpoint cannot edit the merchant's own account. Those settings still need the Dashboard.
- Created replacement webhook `we_1UYnLwPth1byRSsbKJut6qQf` because Stripe does not return an existing endpoint's signing secret. It is disabled, with the original endpoint disabled and marked superseded.
- Uploaded the current main application as unpublished Cloudflare Worker version `ed3f424b-3179-480f-9ad4-241b5840ad56`, with the private API key and new signing secret supplied directly as encrypted bindings. Inspected the uploaded version: `AUTH_SECRET`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are present; both billing flags are false.
- Confirmed production traffic still uses version `cdccf516-163f-496f-bbcc-cf514d78a6f0`. No deployment, D1 migration, billing activation, payment, subscription, Customer or tax-registration creation was performed.

Atlas requirements, account-wide Dashboard settings, tax registration confirmation, sandbox validation, email setup and deployment remain activation requirements. See the current [billing setup](billing-setup.md) for the exact activation order. The staged version is not a claim that production Checkout or tax collection is validated.
