import { Hono } from "hono";
import {
  createTrackingDomain,
  deleteTrackingDomain,
  listTrackingDomains,
  normalizeHostname,
  setCampaignTrackingDomain,
} from "../db/tracking-domains";
import { requireUser, requireWrite } from "../lib/access";
import { isAppHost } from "../lib/host-gate";
import type { Env } from "../types";

const SETUP_HINT =
  "Point the hostname at this Worker: Cloudflare dashboard → Workers & Pages → your Capve Worker → Settings → Domains & Routes → Add Custom Domain (or a route hostname/*). Only /r, /c, /lp and /click are served on it.";

const trackingDomains = new Hono<{ Bindings: Env }>();

trackingDomains.get("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({
    tracking_domains: await listTrackingDomains(c.env.DB, session.account_id),
    setup: SETUP_HINT,
  });
});

trackingDomains.post("/", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req.json<{ hostname?: unknown }>().catch(() => ({}) as { hostname?: unknown });
  const hostname = normalizeHostname(body.hostname);
  if (!hostname) return c.json({ error: "hostname must be a domain like track.example.com" }, 400);
  if (isAppHost(hostname, c.env)) {
    return c.json({ error: "This hostname already serves the app" }, 400);
  }

  const domain = await createTrackingDomain(c.env.DB, session.account_id, hostname);
  if (!domain) return c.json({ error: "Hostname already registered" }, 409);
  return c.json({ tracking_domain: domain, setup: SETUP_HINT }, 201);
});

trackingDomains.delete("/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const ok = await deleteTrackingDomain(c.env.DB, c.req.param("id"), session.account_id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

/** Pick the tracking domain of a campaign (null = default app URL). */
trackingDomains.put("/campaigns/:campaignId", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req
    .json<{ tracking_domain_id?: unknown }>()
    .catch(() => ({}) as { tracking_domain_id?: unknown });
  const raw = body.tracking_domain_id;
  if (raw !== null && raw !== undefined && typeof raw !== "string") {
    return c.json({ error: "tracking_domain_id must be a string or null" }, 400);
  }
  const domainId = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  const result = await setCampaignTrackingDomain(
    c.env.DB,
    c.req.param("campaignId"),
    session.account_id,
    domainId,
  );
  if (result === "campaign_not_found") return c.json({ error: "Not found" }, 404);
  if (result === "domain_not_found") return c.json({ error: "Invalid tracking_domain_id" }, 400);
  return c.json({ ok: true, tracking_domain_id: domainId });
});

export { trackingDomains };
