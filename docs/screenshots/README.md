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

## AI client cards on AI / MCP

Captured with headless Playwright (Chromium) against the local preview build, with API responses mocked for an example account (`demo@example.com`). "Before" is `main` at c3f4c2d, "after" is the PR branch.

- `mcp-clients/before-desktop.png`, `mcp-clients/before-mobile.png`: the old page, a plain URL and two token snippets.
- `mcp-clients/after-desktop.png`, `mcp-clients/after-mobile.png`: full page with one card per AI client (1440px and 390px viewports).
- `mcp-clients/after-desktop-cards.png`, `mcp-clients/after-mobile-top.png`: close-ups of the client cards.
