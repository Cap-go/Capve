# Capve

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Cap-go/Capve)

Open-source, self-hosted affiliate tracking for indie and SaaS founders. Deploy on your Cloudflare account — no SaaS signup, no pricing tiers.

**Repo:** https://github.com/Cap-go/Capve · **Requirements:** [REQUIREMENTS.md](./REQUIREMENTS.md) · **Agents:** [AGENTS.md](./AGENTS.md)

Capve lets you run affiliate programs on infrastructure you control: unique tracking links, click-through cookies, and server-side conversion attribution.

Capve is also an **MCP server**: connect Claude Code, Cursor, VS Code or any MCP client and manage campaigns, paths, offers, reports and team by chat. See [MCP](#mcp).

## Stack

- **Frontend**: React + Vite + Tailwind (homepage + dashboard)
- **Backend**: Cloudflare Worker (Hono)
- **Database**: Cloudflare D1
- **Auth**: email/password sessions for `/app` and dashboard APIs
- **Deploy**: One Worker + static assets (`wrangler.toml`)

## Routes

| Path | Access |
| --- | --- |
| `/` | Public — project homepage + install instructions |
| `/app` | Sign in required (`/register` to create an account) |
| `/r/:code` | Public — affiliate redirect |
| `/api/v1/convert` | Public — conversion API (`X-Program-Secret`) |
| `/api/v1/snippet` | Public — browser attribution snippet |
| `/api/programs/*` | Signed-in users (session cookie or API token) |
| `/mcp` | MCP server (`Authorization: Bearer capve_…`) |

Each program stores a **destination URL**. Tracking links redirect there and append `velo_ref=<code>` for merchant-site attribution.

## MCP

1. Sign in, open **AI / MCP** in the dashboard and create a token (`capve_…`, shown once).
2. Add the server to your client:

```bash
claude mcp add --transport http capve \
  https://capve.app/mcp \
  --header "Authorization: Bearer capve_YOUR_TOKEN"
```

Cursor / VS Code / Windsurf (`mcp.json`):

```json
{ "mcpServers": { "capve": { "url": "https://capve.app/mcp", "headers": { "Authorization": "Bearer capve_YOUR_TOKEN" } } } }
```

40 tools cover campaigns, affiliates, paths and rotation, traffic sources, networks, offers, landers, groups, reports, triggers, notes and team. Each tool replays the matching `/api` route with the token, so validation and team roles are identical to the dashboard. Full docs: `/docs/mcp`. Code: `worker/mcp/`.

Tokens act as the user who created them, can be revoked from the dashboard, and cannot create more tokens. Only a SHA-256 hash is stored.

## Quick install

1. Click **Deploy to Cloudflare** above (or use the [deploy button docs](https://developers.cloudflare.com/workers/platform/deploy-buttons/)).
2. Set `APP_URL` to your hostname in Worker vars / `wrangler.toml`.
3. Open `/app` — create a program (save the **convert secret** shown once), add affiliates.

**Auth:** The dashboard uses email/password sessions (`/register`, `/login`). In production, set `AUTH_SECRET` (random, at least 32 characters) as a Worker secret — never in `wrangler.toml`: `bunx wrangler secret put AUTH_SECRET --env production`. The Worker refuses to sign sessions without it. Configure the `EMAIL` send binding in `wrangler.toml` for password-reset emails.

**Platform admin:** Accounts whose email is listed in `PLATFORM_ADMIN_EMAILS` become platform admins at registration, so register those accounts immediately after deploying.

**Important:** Do not put Cloudflare Access in front of this Worker. It intercepts `/api/auth/*` and breaks login. If an old Access app exists, run `bun run remove-access`. Also, `/r/*`, `/api/v1/convert`, `/api/v1/snippet`, and `/api/health` must stay public.

## Local development

```bash
bun install
bun run db:migrate:local
bun run dev
```

Open http://localhost:5173 — register at `/register`, then open `/app`.

## Tests

```bash
bun run test
bun run typecheck
bun run build
```

Integration tests cover program → affiliate → click → convert → stats, redirect security, CORS, and session auth.

## capve.app (demo install)

https://capve.app is this project’s public homepage and demo deployment on the Digital Shift Cloudflare account. Other users deploy their own copies via the button above.

| Resource | Value |
| --- | --- |
| Worker | `velo` |
| D1 | `velo-db` — `eb916c67-6e45-4798-a6d9-c0e47f99cb8d` |
| Account | `9ee3d7479a3c359681e3fab2c8cb22c0` |

CI deploys on merge to `main` (after tests pass). Build uses `CLOUDFLARE_ENV=production` so custom domains stay in `dist/velo/wrangler.json`.

Manual deploy:

```bash
bun run build
bunx wrangler d1 migrations apply velo-db --remote --env production
bun run deploy
```

## Merchant flow

1. Register at `/register`, then open `/app`
2. Create a program with a destination URL
3. Add an affiliate and copy the `https://your-domain/r/{code}` link
4. Share the link — clicks are tracked and a first-party cookie is set
5. On conversion, POST from your **server** to `/api/v1/convert` with `X-Program-Secret` and `{ order_id, amount, affiliate_code }`

```bash
curl -X POST https://your-domain/api/v1/convert \
  -H "Content-Type: application/json" \
  -H "X-Program-Secret: sk_..." \
  -d '{"order_id":"order_123","amount":49,"affiliate_code":"abc123"}'
```

The browser snippet at `/api/v1/snippet` stores `velo_ref` from the query string into `localStorage`.

## License

Open source — see [github.com/Cap-go/Capve](https://github.com/Cap-go/Capve).
