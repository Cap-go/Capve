import { Hono, type Context } from "hono";
import {
  createAffiliateNetwork,
  createGroup,
  createLander,
  createOffer,
  createTrafficSource,
  deleteEntity,
  deleteGroup,
  entityBelongsTo,
  listAffiliateNetworks,
  listGroups,
  listLanders,
  listOffers,
  listTrafficSources,
  updateAffiliateNetwork,
  updateLander,
  updateOffer,
  updateTrafficSource,
  type DeleteResult,
} from "../db/entities";
import type { Env } from "../types";
import { requireUser, requireWrite } from "../lib/access";
import { parseHttpUrl } from "../lib/urls";

/** Optional money field: absent, or a finite number >= 0. */
function isNonNegativeNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

const entities = new Hono<{ Bindings: Env }>();

const COST_TYPES = ["cpc", "cpm", "cpa"] as const;

/** Optional trimmed non-empty name: undefined = unchanged, null = invalid. */
function optionalName(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  const name = typeof value === "string" ? value.trim() : "";
  return name || null;
}

/** Optional non-negative integer (cents): undefined = unchanged, null = invalid. */
function optionalCents(value: unknown, max = Number.MAX_SAFE_INTEGER): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

/** Optional http(s) URL: undefined = unchanged, null = invalid. */
function optionalUrl(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  const raw = typeof value === "string" ? value.trim() : "";
  return raw && parseHttpUrl(raw) ? raw : null;
}

function deleteResponse(c: Context<{ Bindings: Env }>, result: DeleteResult) {
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ ok: true });
}

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

entities.patch("/traffic-sources/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<Record<string, unknown>>();
  const name = optionalName(body.name);
  if (name === null) return c.json({ error: "Name cannot be empty" }, 400);
  if (body.cost_type !== undefined && !COST_TYPES.includes(body.cost_type as never)) {
    return c.json({ error: "cost_type must be cpc, cpm or cpa" }, 400);
  }
  const cost = optionalCents(body.default_cost_cents);
  if (cost === null) return c.json({ error: "default_cost_cents must be a non-negative integer" }, 400);
  const percent = optionalCents(body.postback_percent, 100);
  if (percent === null) return c.json({ error: "postback_percent must be 0-100" }, 400);
  const source = await updateTrafficSource(c.env.DB, session.account_id, c.req.param("id"), {
    name,
    cost_type: body.cost_type as (typeof COST_TYPES)[number] | undefined,
    default_cost_cents: cost,
    postback_percent: percent,
  });
  if (!source) return c.json({ error: "Not found" }, 404);
  return c.json({ traffic_source: source });
});

entities.delete("/traffic-sources/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  return deleteResponse(
    c,
    await deleteEntity(c.env.DB, "traffic_source", c.req.param("id"), session.account_id),
  );
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

entities.patch("/networks/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<Record<string, unknown>>();
  const name = optionalName(body.name);
  if (name === null) return c.json({ error: "Name cannot be empty" }, 400);
  const network = await updateAffiliateNetwork(c.env.DB, session.account_id, c.req.param("id"), {
    name,
  });
  if (!network) return c.json({ error: "Not found" }, 404);
  return c.json({ network });
});

entities.delete("/networks/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  return deleteResponse(
    c,
    await deleteEntity(c.env.DB, "network", c.req.param("id"), session.account_id),
  );
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

entities.patch("/landers/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<Record<string, unknown>>();
  const name = optionalName(body.name);
  if (name === null) return c.json({ error: "Name cannot be empty" }, 400);
  const url = optionalUrl(body.url);
  if (url === null) return c.json({ error: "Valid http/https URL required" }, 400);
  const lander = await updateLander(c.env.DB, session.account_id, c.req.param("id"), { name, url });
  if (!lander) return c.json({ error: "Not found" }, 404);
  return c.json({ lander });
});

entities.delete("/landers/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  return deleteResponse(
    c,
    await deleteEntity(c.env.DB, "lander", c.req.param("id"), session.account_id),
  );
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

entities.patch("/offers/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<Record<string, unknown>>();
  const name = optionalName(body.name);
  if (name === null) return c.json({ error: "Name cannot be empty" }, 400);
  const url = optionalUrl(body.url);
  if (url === null) return c.json({ error: "Valid http/https URL required" }, 400);
  const payout = optionalCents(body.payout_cents);
  if (payout === null) return c.json({ error: "payout_cents must be a non-negative integer" }, 400);
  let networkId: string | null | undefined;
  if (body.network_id !== undefined) {
    networkId = typeof body.network_id === "string" && body.network_id.trim() ? body.network_id.trim() : null;
    if (
      networkId &&
      !(await entityBelongsTo(c.env.DB, "network", networkId, session.account_id))
    ) {
      return c.json({ error: "Invalid network_id" }, 400);
    }
  }
  const offer = await updateOffer(c.env.DB, session.account_id, c.req.param("id"), {
    name,
    url,
    payout_cents: payout,
    network_id: networkId,
  });
  if (!offer) return c.json({ error: "Not found" }, 404);
  return c.json({ offer });
});

entities.delete("/offers/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  return deleteResponse(
    c,
    await deleteEntity(c.env.DB, "offer", c.req.param("id"), session.account_id),
  );
});

export { entities };
