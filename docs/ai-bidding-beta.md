# AI bidding assistant (beta)

Campaign → Optimization → **AI bidding assistant**. Every existing and new campaign starts **off**. Owners/admins explicitly enable each campaign. Viewers can read settings and recommendations, but cannot enable or run the feature. API tokens follow the same account permissions.

This first beta generates **review-only Adcash zone bid-change recommendations**. It does not change bids, pause campaigns, add blacklist entries, or call the Adcash management API. Export is a review CSV, **not** an Adcash import format. Review current bids/budgets and apply changes in Adcash yourself. This is not a claim of full Binom/Voluum integration parity or improved profitability.

## Setup and use

1. Map Adcash's `[zone]` token to a sub1–sub10 parameter in the campaign's traffic source. Select that same parameter in the assistant.
2. Ensure tracked costs are current. The existing Adcash cost-provider adapter is still marked unverified; do not assume imported spend is correct. The assistant uses persisted per-click costs, including manual cost updates, not a fresh ad-network spend pull.
3. Confirm the spend currency (USD/EUR). Click costs have no currency column: this setting is an explicit operator assertion, not automatic currency detection. Revenue in another currency forces a hold; no FX conversion is attempted.
4. Set minimum clicks/spend, minimum converted clicks for an increase, target ROI and maximum adjustment (1–20%). Choose a 1–720-hour analysis window and a 1–168-hour conversion delay. Defaults are 72h of traffic ending 24h ago, 100 clicks, 1,000 cents, 5 converted clicks, 20% target ROI and a maximum 10% change.
5. Enable the beta and select **Analyze zones**. It runs on demand, at most once every 15 minutes per campaign, including failed attempts. Changing settings cannot reset this limit. No background AI calls occur.
6. Review evidence and reasons, then export if useful. A recommendation is a percentage change to your current bid, not an absolute CPC/CPM amount. Recheck current performance before acting; the UI marks results older than 24 hours.

## Decision contract

The SQL query aggregates a mature click cohort, excluding bots and clicks without zone tokens. Each click's spend is counted once, even with multiple conversion events. Converted clicks are distinct; all accepted conversion-event revenue on those clicks is summed, including later arrivals through analysis time. Pending/hold and rejected conversions are excluded. Multiple events should represent additive revenue, not duplicated payouts. CPA-only/unknown costs cause holds rather than fabricated ROI.

Rules require complete cost data and matching currency. They hold inside a ±10 percentage point ROI band; below it they propose a decrease; above it they propose an increase only with enough converted clicks. Cloudflare's `@cf/zai-org/glm-4.7-flash` reviews eligible candidates. The model can hold or soften the suggested percentage, but cannot change its direction, increase its size, invent zones, or override evidence thresholds. Every result is validated. Invalid/truncated output, provider errors and a 25-second timeout save nothing. A timed-out inference may still finish at Cloudflare, but its result is discarded.

Only numbered candidate IDs and numeric aggregate metrics enter the model prompt. Raw zone labels, IP addresses, user agents, customer identifiers and credentials do not. The model receives no tools or ad-network credentials. At most 100 zones per analysis; larger windows are rejected, not silently truncated. SQL is aggregated in D1; analysis never runs in tracking redirects.

D1 stores the last 20 successful runs per campaign with the model ID, settings, evidence and time window. The API/UI exposes the latest result for the current settings revision. Saving settings invalidates the current result; disabling or editing settings during inference discards the in-flight result. Reporting/subscription locks apply to analysis, reads and CSV exports; settings remain accessible so the beta can always be disabled.

## Deployment (Martin)

- Review/merge the PR only after CI and reviews pass. The agent does not deploy production.
- Apply migration `0030_bidding_beta.sql` through the existing deployment workflow.
- The PR adds `[env.production.ai] binding = "AI"`. Ensure the deploying account can use Workers AI and verify GLM availability. No AI secret is required for the binding. Inference incurs Workers AI usage only after explicit campaign opt-in and an analysis request.
- Self-hosted/default-environment installs may add `[ai]` with `binding = "AI"` to `wrangler.toml`. Local dev intentionally has no remote AI binding. Without one, the UI shows setup is required and analysis returns 503.
- Run a small opt-in smoke test with known mature zone data. Compare aggregates with source records, inspect the model result, disable the beta, and confirm analysis returns 409. No account is enrolled by the migration or deployment.

## CI coverage and limits

`bun run test` includes `tests/bidding.test.ts` in the existing PR/main CI pipeline. It exercises the real Worker routes and D1 schema/migration with deterministic model responses, plus decision validation, auth, team roles, cross-account isolation, billing, MCP, cooldown/concurrency, cohorts, cost/revenue handling and failure modes. No production credentials or paid inference are required in CI. Typecheck and the production build also run.

These tests prove the integration and guardrails, **not** model quality, profitability, or live Adcash API compatibility. A live Workers AI smoke test remains an operator check; remote inference was not called for screenshots or CI. A subsequent CLI smoke test on 2026-11-16 validated two synthetic candidates through the real Workers AI binding and the production response validator in about four seconds. GLM thinking is disabled for this bounded classification task; the default thinking mode exceeded the 25-second request deadline. Screenshots use local demonstration data and explicitly seeded recommendations.

References checked 2026-11-15: [Cloudflare GLM model contract](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/), [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/), [Adcash Client API overview](https://support.adcash.com/en/articles/405-client-api-overview).
