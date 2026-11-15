# Tracking domains

A tracking domain is a hostname the customer owns, such as `track.example.com`, that serves their campaign links (`/r`, `/c`, `/lp`, `/click`). Every other path on it returns 404, so it never exposes the dashboard.

Capve sets domains up one of two ways:

| Mode | When | What the user does |
| --- | --- | --- |
| Automatic | `TRACKING_DOMAIN_ZONE_ID`, `TRACKING_DOMAIN_API_TOKEN` and `TRACKING_DOMAIN_CNAME_TARGET` are all set | Adds the hostname in Settings → Tracking domains, then adds one CNAME record. Cloudflare issues HTTPS once the record is live. |
| Manual | Any of them is missing (default for self-hosted installs) | Adds the hostname in Settings, then attaches it to the Worker as a Custom Domain in Cloudflare. |

## How automatic setup works

Each hostname becomes a [Cloudflare for SaaS custom hostname](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/) on the platform zone (`capve.app` for the hosted service).

1. **Add.** `POST /api/tracking-domains` stores the domain and creates the custom hostname with HTTP domain validation. If Cloudflare refuses, the domain is removed the same way as in step 5 (including any hostname a parallel status check attached) and the user sees Cloudflare's reason.
2. **Point DNS.** The response and the Settings page show one record: `CNAME track.example.com → domains.capve.app`. Users on Cloudflare DNS set it to DNS only.
3. **Go live.** `GET /api/tracking-domains` re-checks domains with Cloudflare: pending ones at most every 15 seconds, active ones hourly. The Settings page polls while a domain is waiting. Statuses: `pending` (waiting for DNS or the certificate), `active`, `failed` (for example the CNAME was removed, Cloudflare blocked the hostname, registration failed or the domain is over the limit) and `manual` (only when automatic setup is off). Pending and failed domains keep being re-checked. Cloudflare's verification errors are shown under the domain.
4. **Recover.** When certificate validation times out, the next check restarts it. A domain added by hand before automatic setup was turned on, or whose custom hostname was deleted in Cloudflare, is registered on the next check. Domains added by hand are only registered for the account's 20 oldest domains; the rest show an over-the-limit message until another domain is removed.
5. **Remove.** `DELETE /api/tracking-domains/:id` marks the domain as being removed, deletes the custom hostname, then deletes the domain. While it is marked, status checks don't write to it, and a check that recreated a hostname in the meantime deletes it again, so no hostname is left without a domain. If that deletion fails, the hostname goes to the `tracking_domain_cleanup` table and the hourly cron job retries it until Cloudflare confirms. If Cloudflare can't be reached, the mark is cleared, nothing is deleted and the user can try again. A domain with a custom hostname can't be removed while automatic setup is off (the removal is refused with 409), because nothing else records that hostname.

An account can have up to 20 tracking domains in automatic mode, checked in the same database statement as the insert so parallel requests can't go past it. Cloudflare for SaaS works on the Free plan: each zone includes 100 custom hostnames, then Cloudflare bills $0.10 per hostname per month ([plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)).

The dashboard and MCP tools are the same in both modes: `list_tracking_domains` returns the status and DNS records, and `add_tracking_domain` returns the record to add.

## One-time platform setup (capve.app)

Martin does this once in the Cloudflare dashboard. Until step 5, tracking domains stay manual.

1. **Fallback origin record.** DNS → Records for `capve.app`: add `AAAA` `domains` → `100::`, proxied. Requests for customer hostnames arrive here and the Worker answers them; nothing listens on `100::`.
2. **Enable Cloudflare for SaaS.** SSL/TLS → Custom Hostnames → enable, then set the fallback origin to `domains.capve.app` and wait until it shows Active.
3. **Worker route.** `wrangler.toml` already routes `*/*` on the `capve.app` zone to the `velo` Worker (`[[env.production.routes]]`), and the next deploy adds it. Keep it in `wrangler.toml`: `wrangler deploy` replaces routes added in the dashboard. The deploy token (`CLOUDFLARE_API_TOKEN`) needs **Zone → Workers Routes → Edit** on `capve.app`.
4. **API token for the Worker.** My Profile → API Tokens → Create custom token: permission **Zone → SSL and Certificates → Edit**, zone resources **Include → Specific zone → capve.app**. Nothing else.
5. **Secret.** `bunx wrangler secret put TRACKING_DOMAIN_API_TOKEN --env production` and paste the token. `TRACKING_DOMAIN_ZONE_ID` and `TRACKING_DOMAIN_CNAME_TARGET` are already set in `wrangler.toml` `[env.production]`.
6. **Check.** Add a test hostname in Settings → Tracking domains, add its CNAME to `domains.capve.app`, wait for **Active**, attach it to a campaign and open `https://<hostname>/c/<campaign key>`. Then `https://<hostname>/app` must return 404.

## Self-hosted installs

The same steps work on your own zone. Replace `capve.app` with your zone and `domains.capve.app` with your fallback origin, then set:

```toml
[vars]
TRACKING_DOMAIN_ZONE_ID = "<your zone id>"            # Overview page of the zone, right column
TRACKING_DOMAIN_CNAME_TARGET = "domains.example.com"  # your fallback origin
```

and add the route to your `wrangler.toml`:

```toml
[[routes]]
pattern = "*/*"
zone_name = "example.com"
```

Store the token with `bunx wrangler secret put TRACKING_DOMAIN_API_TOKEN`. Without these settings, add each hostname as a Custom Domain of the Worker (Workers & Pages → the Worker → Settings → Domains & Routes).
