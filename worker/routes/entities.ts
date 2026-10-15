import { Hono } from "hono";
import {
  createAffiliateNetwork,
  createGroup,
  createLander,
  createOffer,
  createTrafficSource,
  deleteGroup,
  entityBelongsTo,
  listAffiliateNetworks,
  listGroups,
  listLanders,
  listOffers,
  listTrafficSources,
} from "../db/entities";
import type { Env } from "../types";
import { requireUser, requireWrite } from "../lib/access";
import { parseHttpUrl } from "../lib/urls";

/** Optional money field: absent, or a finite number >= 0. */
function isNonNegativeNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

const entities = new Hono<{ Bindings: Env }>();

entities.get("/groups", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ groups: await listGroups(c.env.DB, session.account_id) });
});

entities.post("/groups", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();
  if (!name) return c.json({ error: "Name required" }, 400);
  const group = await createGroup(c.env.DB, session.account_id, name);
  return c.json({ group }, 201);
});

entities.delete("/groups/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const ok = await deleteGroup(c.env.DB, c.req.param("id"), session.account_id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

entities.get("/traffic-sources", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ traffic_sources: await listTrafficSources(c.env.DB, session.account_id) });
});

entities.post("/traffic-sources", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<{
    name?: string;
    cost_type?: "cpc" | "cpm" | "cpa";
    default_cost_cents?: number;
    postback_percent?: number;
  }>();
  const name = body.name?.trim();
  if (!name) return c.json({ error: "Name required" }, 400);
  if (body.cost_type !== undefined && !["cpc", "cpm", "cpa"].includes(body.cost_type)) {
    return c.json({ error: "cost_type must be cpc, cpm or cpa" }, 400);
  }
  if (!isNonNegativeNumber(body.default_cost_cents)) {
    return c.json({ error: "default_cost_cents must be a non-negative number" }, 400);
  }
  if (
    body.postback_percent !== undefined &&
    (!Number.isInteger(body.postback_percent) || body.postback_percent < 0 || body.postback_percent > 100)
  ) {
    return c.json({ error: "postback_percent must be an integer from 0 to 100" }, 400);
  }
  const source = await createTrafficSource(c.env.DB, session.account_id, {
    name,
    cost_type: body.cost_type,
    default_cost_cents: body.default_cost_cents,
    postback_percent: body.postback_percent,
  });
  return c.json({ traffic_source: source }, 201);
});

entities.get("/networks", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ networks: await listAffiliateNetworks(c.env.DB, session.account_id) });
});

entities.post("/networks", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();
  if (!name) return c.json({ error: "Name required" }, 400);
  const network = await createAffiliateNetwork(c.env.DB, session.account_id, { name });
  return c.json({ network }, 201);
});

entities.get("/landers", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ landers: await listLanders(c.env.DB, session.account_id) });
});

entities.post("/landers", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<{ name?: string; url?: string }>();
  const name = body.name?.trim();
  const url = body.url?.trim();
  if (!name || !url) return c.json({ error: "Name and URL required" }, 400);
  if (!parseHttpUrl(url)) return c.json({ error: "Valid http/https URL required" }, 400);
  const lander = await createLander(c.env.DB, session.account_id, { name, url });
  return c.json({ lander }, 201);
});

entities.get("/offers", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ offers: await listOffers(c.env.DB, session.account_id) });
});

entities.post("/offers", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<{
    name?: string;
    url?: string;
    network_id?: string | null;
    payout_cents?: number;
  }>();
  const name = body.name?.trim();
  const url = body.url?.trim();
  if (!name || !url) return c.json({ error: "Name and URL required" }, 400);
  if (!parseHttpUrl(url)) return c.json({ error: "Valid http/https URL required" }, 400);
  if (!isNonNegativeNumber(body.payout_cents)) {
    return c.json({ error: "payout_cents must be a non-negative number" }, 400);
  }
  if (
    body.network_id &&
    !(await entityBelongsTo(c.env.DB, "network", body.network_id, session.account_id))
  ) {
    return c.json({ error: "Invalid network_id" }, 400);
  }
  const offer = await createOffer(c.env.DB, session.account_id, {
    name,
    url,
    network_id: body.network_id,
    payout_cents: body.payout_cents,
  });
  return c.json({ offer }, 201);
});

export { entities };
