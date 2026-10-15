# Capve requirements

Capve is an **open-source alternative to Binom**: a campaign and affiliate tracker that runs on Cloudflare Workers + D1. Anyone can deploy it on their own Cloudflare account; `capve.app` is this repo's demo install. It is **not** Capgo's Affonso program and does not replace it.

## Product

A Capve instance lets a user:

1. Register / sign in with email and password (`/register`, `/login`)
2. Create **campaigns** with a destination URL, traffic source, and group
3. Route traffic through **paths** (direct URL, offer, lander → offer) with weighted, sticky, pinned, or top-to-bottom rotation
4. Manage **traffic sources, affiliate networks, offers, landers, groups**
5. Share tracking links (`/r/:code` per affiliate, `/c/:key` per campaign)
6. Receive conversions via **S2S postback** (`/click?cnv_id=…`) or the JSON convert API
7. Do all of the above from an AI assistant through the **MCP server** (`/mcp`, personal API token)
8. See **reports**: clicks, unique clicks, bots, LP clicks, conversions, revenue, cost, profit, ROI, EPC, CR — per campaign, per day, and grouped by any click dimension

## Done means (checklist)

| Requirement | Implementation |
| --- | --- |
| Auth | Email/password sessions (`worker/lib/session.ts`, `worker/lib/access.ts`); `AUTH_SECRET` is a Worker secret in production |
| Teams | Owner invites by email; invite applies only after the invitee accepts |
| Click redirect | `/r/:code`, `/c/:key` → path target; appends `click_id` + `velo_ref`; paused campaigns 404 |
| Click context | country/region/city/ISP from `request.cf`, device/OS/browser from UA, `sub1`–`sub10`, external `clickid`, per-click `cost`, unique + bot flags |
| Routing rules | Ordered per-campaign rules (`worker/lib/rules.ts`): AND-ed `in`/`not_in` conditions on geo, device, OS, browser, ISP/ASN, language, connection, bot, referrer, IP/CIDR, weekday/hour (rule timezone), sub1–sub10; first match uses its own paths, else default pool |
| Weighted landers/offers | A path holds several weighted landers and offers (`path_landers`, `path_offers`); the chosen ones are stored on the click |
| Anti-fraud | Account blocklist (IP/CIDR, ASN, UA substring), optional datacenter-ASN flag, per-campaign `bot_action` (`route` or configured `safe_page_url`); flagged clicks get `is_bot = 1` |
| URL macros | `{clickid}`/`{click_id}`, `{campaign_id}`, `{offer_id}`, `{lander_id}`, `{country}`, `{external_id}`, `{sub1}`–`{sub10}`, `{lp_click_url}` |
| LP click | `/lp/:clickId` marks the LP click and redirects to the click's offer |
| Postback | `GET /click?cnv_id=&payout=&cnv_status=&tx_id=&event=`; repeat for same click (and event) updates status/payout; no payout → offer payout (events: 0) |
| Conversion events | `event=registration`, `event=ftd`, … each recorded as its own conversion; per-event counts in stats, reports and CSV |
| Outgoing postbacks | Many per campaign (all statuses), traffic source (approved, `postback_percent`) and network (approved, offer's network); each optionally limited to one event |
| Convert API | `POST /api/v1/convert` with `X-Program-Secret`; CORS enabled; idempotent by `(program_id, order_id)` |
| Reports | `/api/reports/*` incl. `/grouped?by=` (country, device, OS, browser, ISP, offer, lander, path, traffic source, sub1–sub10, date…); rejected statuses excluded from revenue |
| MCP | `POST /mcp` (Streamable HTTP, stateless JSON-RPC) in `worker/mcp/`; each tool replays an `/api` route with the bearer token; tokens in `api_tokens` (hash only), managed at `/api/tokens` with a session cookie only |
| Redirect safety | Only configured destinations/offers/landers; `?url=` same host only; postback/webhook URLs must be http(s) |

### Routes

**Public** (no session): `/`, `/docs/*`, `/login`, `/register`, `/r/:code`, `/c/:key`, `/lp/:clickId`, `/click`, `POST /api/v1/convert` + OPTIONS, `GET /api/v1/snippet`, `GET /api/health`, `/api/auth/*`.

**Session or API token** (`Authorization: Bearer capve_…`): `/app`, `/api/programs*`, `/api/campaigns*`, `/api/entities*`, `/api/reports*`, `/api/ops*`, `/api/admin*`, `/mcp`.

**Session cookie only**: `/api/tokens*` (a token cannot mint tokens).

Tracking and API paths are listed in `assets.run_worker_first` in `wrangler.toml` so browser navigations reach the Worker instead of the SPA fallback.

**Do not put Cloudflare Access in front of the Worker.** It intercepts `/api/auth/*` and breaks login. `bun run remove-access` (and the deploy workflow) deletes any leftover Access app.

### Install

- **One-click:** [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/Cap-go/Capve) provisions Worker + D1.
- Set the session secret: `bunx wrangler secret put AUTH_SECRET` (32+ chars).
- Optional: `PLATFORM_ADMIN_EMAILS` var; register that account right after deploy.
- Optional: Cloudflare Email Service `send_email` binding for password-reset emails.

### Tests (`bun run test`)

Must pass in CI: tracking flow, redirect security, CORS, session auth, security (invites, ownership, URL validation, campaign keys), Binom parity (status upsert, payout fallback, click context, grouped reports, LP click, traffic-source postback, conversion events with multiple postbacks).

### CI / deploy

- **CI** (`.github/workflows/ci.yml`): typecheck, test, build on PRs and `main`
- **Deploy** (`.github/workflows/deploy.yml`): after CI succeeds on `main` — build, D1 migrations, remove leftover Access app, `wrangler deploy --env production`

**Cloudflare target (capve.app demo install)**

| Resource | Value |
| --- | --- |
| Worker name | `velo` |
| D1 database | `velo-db` — `eb916c67-6e45-4798-a6d9-c0e47f99cb8d` |
| Account | Digital shift — `9ee3d7479a3c359681e3fab2c8cb22c0` |
| Production URL | `https://capve.app` |
| Worker secret | `AUTH_SECRET` (set with `wrangler secret put`, never in git) |

GitHub org secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are already set at Cap-go org level.

## Out of scope

Do **not** build these unless explicitly requested:

- Stripe / billing / pricing tiers
- Social login
- Affiliate payouts
- Replacing or integrating with **Affonso**
- Host splits (e.g. separate console subdomain)

## Non-goals / security

- **No open redirects**
- **No secrets in git** — Worker secrets / GitHub org secrets only
- **No dummy D1 IDs** in production config
- **No pinned action SHAs** — GitHub Actions use version tags
- **No workers.dev or capgo.app product URLs** — `capve.app` is the homepage/demo

## Reference

Operational commands: [README.md](./README.md)

Agent workflow: [AGENTS.md](./AGENTS.md)
