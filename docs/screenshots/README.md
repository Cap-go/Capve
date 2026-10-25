# Hosted billing review screenshots

Captured from the local app for PR #43 using an example account, with billing enabled and Stripe configuration deferred. No production account or payment was used.

- `pricing-desktop.png`: hosted pricing at 1280px viewport width.
- `pricing-mobile.png`: the same pricing section at 390px viewport width; no horizontal overflow.
- `billing-expired-trial.png`: the real expired-trial billing state, including the pending Stripe setup message.
- `tracking-links-locked.png`: existing affiliate tracking URLs remain available while reporting columns are hidden.

The tracking and billing views use a local database trial expiry. URLs and account details shown belong to local example data.

## Imprint and legal company correction

Captured from the local app for the follow-up imprint PR. Company address and public contact details match the connected Stripe account's company and business profile. No private owner, bank, tax identifier or verification data is shown.

- `imprint-desktop.png`: full imprint at a 1440px viewport width.
- `imprint-mobile.png`: full imprint at a 390px viewport width; no horizontal overflow.
