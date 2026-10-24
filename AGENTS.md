# AGENTS.md — Capve

Read **[REQUIREMENTS.md](./REQUIREMENTS.md)** first. It defines what Capve is, what “done” means, and what is out of scope.

Capve = **open-source Binom alternative**: campaign and affiliate tracking on Cloudflare (Worker + D1). Self-hostable; capve.app is the demo install. **Not** Capgo Affonso. Hosted pricing and billing are opt-in. See `docs/billing-setup.md`.

## Repo map

| Path | Purpose |
| --- | --- |
| `worker/` | Hono API, redirect, LP click, postback, convert, session auth |
| `worker/lib/access.ts` | Session + API-token auth (`requireUser`, team roles) |
| `worker/mcp/` | MCP server (`/mcp`); `tools.ts` maps each tool to an `/api` route |
| `src/` | React UI (homepage `/`, dashboard `/app`) |
| `src/lib/constants.ts` | Deploy button + GitHub URLs |
| `migrations/` | D1 schema |
| `tests/tracking.test.ts` | Integration tests (Workers pool) |
| `wrangler.toml` | Worker + D1 + production vars |
| `.github/workflows/` | CI + deploy |

Stack: TypeScript, Bun, Vite, Cloudflare Worker + D1, `@cloudflare/vite-plugin`.

## Production URL

**https://capve.app** — this repo’s demo/homepage install: landing `/`, dashboard `/app`, API, tracking `/r/{code}`.

Do **not** use `*.workers.dev`, `*.capgo.app`, or split hosts (e.g. `console.capve.app`).

## Local commands

```bash
bun install
bun run db:migrate:local
bun run dev          # http://localhost:5173
bun run test         # must pass before PR
bun run typecheck
bun run build
```

Local dev uses email/password sessions (`/login`, `/register`). The local-dev `AUTH_SECRET` is in `wrangler.toml` `[vars]`; production must set it as a secret (`bunx wrangler secret put AUTH_SECRET --env production`, at least 32 chars) — never commit it. Auth emails use the Cloudflare `EMAIL` send binding (`noreply@capve.app`).

## Finish deploy (for a later agent)

1. **Secrets:** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from Cap-go **org** secrets (already set).
2. **D1:** `velo-db` — id `eb916c67-6e45-4798-a6d9-c0e47f99cb8d` on account `9ee3d7479a3c359681e3fab2c8cb22c0` (see `wrangler.toml`).
3. **Worker secret:** `bunx wrangler secret put AUTH_SECRET --env production` (random, ≥32 chars). Not in `wrangler.toml`.
4. Merge PR to `main` (only when CI green and review approved).
5. Deploy workflow: migrations → `wrangler deploy --env production --var APP_URL:https://capve.app`
6. Enable Cloudflare Email Service on `capve.app` and verify `noreply@capve.app` as a sender (see `send_email` binding in `wrangler.toml`).
7. Smoke test at **https://capve.app**:
   - `/` loads homepage with Deploy button
   - `/r/:code` → merchant URL with `velo_ref=`
   - POST convert with `X-Program-Secret` + `affiliate_code` → stats update
   - `/app` works after sign-in (register at `/register`)

## Rules when changing code

- Match existing patterns; minimal diff
- Hosted Stripe pricing/trials and Bento email are authorized; see REQUIREMENTS.md. Do not add payouts, social login, or Affonso integration unless asked
- Keep redirect allowlist logic — never redirect to arbitrary hosts
- Conversions: `affiliate_code` + `X-Program-Secret` (server-only); CORS on convert
- Dashboard APIs require a valid session cookie or API token (`worker/lib/access.ts`)
- New dashboard API features should get a matching MCP tool in `worker/mcp/tools.ts` (and the list in `src/pages/docs/DocsMcp.tsx`)
- Public routes must stay public: `/`, `/r/*`, `/api/v1/convert`, `/api/v1/snippet`
- Run `bun run test` and keep CI green
- Use version tags for GitHub Actions, not SHA pins
- Do not commit secrets or placeholder D1 IDs
- Do not add Cloudflare secrets to the Capve repo — they live at Cap-go org level
- Do **not** split landing vs dashboard onto separate hostnames unless explicitly requested

## PR workflow

- Branch: `cursor/<name>-1798`
- Open PR → wait for CI → fix review comments → do not merge unless asked
- Do not deploy to production yourself; document what Martin must do
