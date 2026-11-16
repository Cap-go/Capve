# MCP OAuth

Connect an OAuth-capable MCP client to `https://capve.app/mcp`, select OAuth, sign in to Capve, and approve the consent screen. Personal API tokens continue to work for scripts and clients that use manual headers.

Public client configuration is available at `/mcp.json` and `/.well-known/mcp.json`; it contains the MCP URL and no credentials. Ordinary browser or plain GET visits to `/mcp` redirect to `/docs/mcp`. Requests advertising JSON, SSE, protocol headers, or bearer credentials retain the MCP authentication behavior, and POST requests always require authentication.

The client name is supplied during registration and is not an endorsement by Capve. Consent displays the callback address and the actual personal account being authorized. The `mcp:tools` scope permits reading and changing personal account campaigns, reports, settings, team and integrations, including deletion. Team accounts, platform administration, billing checkout, token management and connection management remain unavailable through OAuth tokens. Existing billing/report gates still apply.

## Protocol endpoints

| Endpoint | Purpose |
| --- | --- |
| `/.well-known/oauth-protected-resource/mcp` | RFC 9728 metadata; also available without `/mcp` |
| `/.well-known/oauth-authorization-server` | RFC 8414 authorization server metadata |
| `/oauth/register` | RFC 7591 dynamic client registration |
| `/oauth/authorize` | Authorization code with mandatory PKCE S256 and explicit consent |
| `/oauth/token` | Code exchange and refresh token rotation |
| `/oauth/revoke` | RFC 7009 token-family revocation |

The canonical issuer is the origin of `APP_URL`; the resource is `<issuer>/mcp`. Clients must send that resource on authorization and token requests. Local development uses the request's loopback origin so ephemeral test ports work. Production OAuth endpoints require HTTPS.

Registration accepts public (`none`) and confidential (`client_secret_post` or `client_secret_basic`) clients. Redirects must match exactly and use HTTPS, except HTTP loopback callbacks. This is OAuth authorization using Capve's existing email/password sessions, not OpenID Connect or social login. Client ID metadata documents and client-credentials grants are not supported; clients can discover the dynamic registration endpoint.

Browser clients may call MCP from a registered callback origin. OAuth protocol endpoints expose CORS without cookies; consent and connection management require the signed-in browser session and same-origin mutations.

## Credentials and revocation

- Consent requests are signed, bound to the signed-in user and session version, and expire after 10 minutes. Support impersonation cannot authorize apps.
- Authorization codes expire after 5 minutes and are consumed atomically, bound to client, callback, resource and PKCE challenge.
- Access tokens last at most one hour. Refresh tokens rotate at every use. Connections have an absolute 30-day expiry; reconnect after that.
- Codes, access tokens, refresh tokens and confidential-client secrets are stored as SHA-256 hashes. Raw credentials are only returned once.
- Reusing a redeemed code or rotated refresh token invalidates the connection's token family. Clients should serialize refresh requests.
- **Disconnect** in **API & MCP**, RFC 7009 revocation, password reset, or **Sign out everywhere** invalidate access and refresh tokens immediately. A normal single-session logout does not disconnect apps.
- Daily retention removes expired grants/tokens, abandoned authorizations and old unused registrations. Spent refresh tokens stay until their grant ends to detect replay.
- Public registration, token exchange and revocation reuse the optional `AUTH_IP_LIMITER` binding. Production already configures it; self-hosters should retain the auth rate-limit configuration in `wrangler.toml`.

## Deployment

No new Cloudflare bindings, secrets or external identity provider are needed. Keep the existing `AUTH_SECRET` configured and set `APP_URL` to the install's HTTPS origin.

Merge only after CI/review approval. The normal deployment workflow applies `0031_mcp_oauth.sql` before deploying the Worker. For a manual self-hosted rollout, apply D1 migrations before publishing the build. This PR does not deploy production.

After deployment, verify an unauthenticated `/mcp` request with `Accept: application/json` includes `WWW-Authenticate` with `resource_metadata`, connect with an OAuth-capable MCP client, approve consent, call `whoami`, then disconnect and verify the old token gets 401. Repeat the hosted checker from the reported screenshot after deployment; local tests do not establish its hosted score.

## Validation and screenshots

Run `bun run test`, `bun run test:mcp:clients`, `bun run typecheck`, and `bun run build`. Both regression and SDK OAuth checks run in CI.

Screenshots in `docs/screenshots/mcp-oauth/` show the actual local browser consent (desktop/mobile) and connected-app management using a disposable example account.
