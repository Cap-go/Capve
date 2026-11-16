# Platform management beta

Capve can inspect connected advertising accounts and send explicit campaign changes from the console or MCP. This is separate from traffic-source tokens, cost import and the review-only AI bidding beta.

Every connection starts disabled. In **Traffic sources → URL parameters**, select a source, then use **Platform management** to select a provider and save its management credential. Enable the connection for reads; separately enable **Allow console and MCP to change live campaigns** for writes. Writers can configure and execute changes; viewers can inspect enabled connections. The credential grants access to the provider account's campaigns, not only campaigns already tracked by Capve.

## Supported capabilities

| Provider | Reads | Explicit changes | Credential / limitation |
| --- | --- | --- | --- |
| Adcash | Campaigns, payouts/bids, active budget | Country/zone payout bid, active campaign budget | **Temporary Client API access token**, valid for 15 minutes. The long-lived Client API token and Reporting API key cannot be used here. Automatic token exchange and pause/resume are not implemented pending the signed-in API reference. |
| PropellerAds | Campaigns, campaign rates, zone rates, zone exclusions | Zone bid, daily budget, pause/resume, append zone exclusions | Advertiser API token from the profile. |
| RichAds | Campaigns | Campaign bid, existing limited daily budget, pause/resume | Advertiser API key from Settings. Unlimited budgets cannot be changed with the daily-budget action. |
| TrafficStars | Campaigns, custom spot prices | Direct-traffic campaign bid, spot bid, daily budget, pause/resume | Profile API key / offline refresh token; exchanged server-side for temporary access. Direct price changes do not change RTB prices. |

Zeropark management is deferred because its advertiser management API reference requires account access. Its existing tracking template remains available.

Amounts use each provider's currency and pricing model, **not Capve cents**. The action form and catalog describe units. Adcash uses the account's EUR/USD currency. RichAds and PropellerAds actions use USD. Inspect the campaign and bid model before changing a value. No currency conversion or automatic recommendation application occurs.

## Shared API and MCP

- `GET /api/platforms` / `list_platform_integrations`: provider setup, limitations and JSON schemas for supported actions.
- `GET /api/platforms/sources/:id` / `get_platform_connection`: credential presence, opt-ins and revision; never the credential.
- `PUT /api/platforms/sources/:id` / `configure_platform_connection`: provider, explicit enabled/write flags, current revision and optional credential. Omit the credential to preserve it for the same provider; use null to remove it. Changing provider clears it.
- `POST /api/platforms/sources/:id/read` / `read_platform_data`: a read-only action, params and current revision.
- `POST /api/platforms/sources/:id/execute` / `execute_platform_action`: a write action, params, current revision and unique operation ID.
- `GET /api/platforms/sources/:id/operations` / `list_platform_operations`: 50 recent change records, newest first, with result status/message; provider response data is omitted from history.

The **source ID** is Capve's traffic-source ID. The **campaign ID in action params** belongs to the advertising provider. Source/zone/spot IDs come from the provider's placement reports.

Changes are recorded in D1 before dispatch. Repeating an operation ID with the same action/parameters/revision never dispatches it again; reusing it for a different request is rejected. Provider requests have a 15-second timeout and are never automatically retried or redirected. Connection revisions reject stale forms and MCP calls.

Results distinguish `accepted`, `failed` and `unknown`. A successful HTTP response can still contain per-campaign failures. `accepted` means the provider accepted the request, not that a subsequent read verified state. Read the campaign again. A timeout, lost response or interrupted operation may leave an unknown outcome; inspect the provider before creating another operation. Disabling a connection prevents new requests but cannot cancel an already dispatched provider request.

Credentials are encrypted in D1 with `AUTH_SECRET`, independent of cost-import credentials. Rotating `AUTH_SECRET` requires re-entering saved credentials. Provider credential fields and exact credential strings are redacted from returned data; upstream error bodies are not returned or logged. Credentials are never sent to Workers AI.

## Validation and deployment

`tests/platforms.test.ts` runs in the normal CI suite: documented request contracts, permissions, opt-in defaults, encryption, stale revisions, duplicate/concurrent requests, unknown outcomes, HTTP-200 failures, redaction, redirects, response limits and TrafficStars token exchange. `tests/mcp-contracts.test.ts` exercises all six new tools through authenticated MCP, validates outputs, and checks deduplicated execution.

These tests use provider fixtures and mocked network responses. They do **not** establish live account access, provider entitlement or end-to-end acceptance. No advertising accounts or production campaigns were changed during implementation.

Merge only after CI and review approval. The existing deploy workflow applies migration `0032_platform_management.sql`. No new Worker secrets or bindings are required, and the migration enables nothing for existing users. Do not manually bypass the deploy workflow.

## API references checked

- [Adcash Client API](https://support.adcash.com/en/categories/50-client-api): [authentication](https://support.adcash.com/en/articles/406-client-api-authentication), [payouts](https://support.adcash.com/en/articles/416-payouts), [budget](https://support.adcash.com/en/articles/420-budget). Complete signed-in reference: `https://adcash.myadcash.com/docs/client-api`.
- [PropellerAds OpenAPI](https://ssp-api.propellerads.com/v5/docs/adv/specs.yaml), including the referenced campaign, rates, exclusion and zone-rate schemas.
- [RichAds advertiser OpenAPI](https://api.richads.com/public/doc/api).
- [Zeropark API guide](https://doc.zeropark.com/article/zeropark-api-usage-guide), [public campaign read endpoint](https://doc.zeropark.com/article/commerce-media-deeplink-campaigns-api). General management reference requires account access at `https://panel.zeropark.com/api/docs`.
- [TrafficStars authentication](https://docs.trafficstars.com/#/_auth) and [campaign API](https://docs.trafficstars.com/#/_campaigns).
