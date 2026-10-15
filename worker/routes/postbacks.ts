import { Hono } from "hono";
import { entityBelongsTo } from "../db/entities";
import {
  createPostback,
  deletePostback,
  listPostbackDeliveries,
  listPostbacks,
  MAX_POSTBACKS_PER_OWNER,
  updatePostback,
  type PostbackOwner,
} from "../db/postbacks";
import { getProgram } from "../db/queries";
import { requireUser, requireWrite } from "../lib/access";
import { normalizeEvent } from "../lib/postback";
import { optionalHttpUrl } from "../lib/urls";
import type { Env } from "../types";

/** Outgoing postbacks: many per campaign, traffic source or affiliate network. */
const postbacks = new Hono<{ Bindings: Env }>();

type OwnerInput = { campaign_id?: string; traffic_source_id?: string; network_id?: string };

/** Exactly one owner id; `undefined` when none given, `null` when ambiguous. */
function ownerFrom(input: OwnerInput): PostbackOwner | null | undefined {
  const owners: PostbackOwner[] = [];
  if (input.campaign_id?.trim()) owners.push({ kind: "campaign", id: input.campaign_id.trim() });
  if (input.traffic_source_id?.trim()) {
    owners.push({ kind: "traffic_source", id: input.traffic_source_id.trim() });
  }
  if (input.network_id?.trim()) owners.push({ kind: "network", id: input.network_id.trim() });
  if (owners.length === 0) return undefined;
  return owners.length === 1 ? owners[0] : null;
}

async function ownerBelongsTo(db: D1Database, owner: PostbackOwner, accountId: string) {
  if (owner.kind === "campaign") return Boolean(await getProgram(db, owner.id, accountId));
  return entityBelongsTo(db, owner.kind, owner.id, accountId);
}

const EVENT_ERROR = "event must be 1-40 chars: a-z, 0-9, _ . -";

postbacks.get("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const owner = ownerFrom({
    campaign_id: c.req.query("campaign_id"),
    traffic_source_id: c.req.query("traffic_source_id"),
    network_id: c.req.query("network_id"),
  });
  if (owner === null) return c.json({ error: "Filter by one owner at most" }, 400);
  return c.json({ postbacks: await listPostbacks(c.env.DB, session.account_id, owner) });
});

/** Recent delivery attempts (status code / error) of one outgoing postback. */
postbacks.get("/:id/deliveries", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const limit = Number(c.req.query("limit") ?? 20);
  const deliveries = await listPostbackDeliveries(
    c.env.DB,
    c.req.param("id"),
    session.account_id,
    Number.isFinite(limit) ? Math.trunc(limit) : 20,
  );
  if (!deliveries) return c.json({ error: "Not found" }, 404);
  return c.json({ deliveries });
});

postbacks.post("/", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<OwnerInput & { event?: string | null; url?: string }>();

  const owner = ownerFrom(body);
  if (!owner) {
    return c.json({ error: "Exactly one of campaign_id, traffic_source_id, network_id required" }, 400);
  }
  if (!(await ownerBelongsTo(c.env.DB, owner, session.account_id))) {
    return c.json({ error: "Not found" }, 404);
  }
  const url = optionalHttpUrl(body.url);
  if (!url) return c.json({ error: "url must be an http/https URL" }, 400);
  const event = normalizeEvent(body.event);
  if (event === false) return c.json({ error: EVENT_ERROR }, 400);

  const postback = await createPostback(c.env.DB, session.account_id, owner, { event, url });
  if (!postback) {
    return c.json({ error: `At most ${MAX_POSTBACKS_PER_OWNER} postbacks each` }, 400);
  }
  return c.json({ postback }, 201);
});

postbacks.patch("/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req.json<{ event?: string | null; url?: string }>();

  const updates: { event?: string | null; url?: string } = {};
  if (body.url !== undefined) {
    const url = optionalHttpUrl(body.url);
    if (!url) return c.json({ error: "url must be an http/https URL" }, 400);
    updates.url = url;
  }
  if (body.event !== undefined) {
    const event = normalizeEvent(body.event);
    if (event === false) return c.json({ error: EVENT_ERROR }, 400);
    updates.event = event;
  }

  const postback = await updatePostback(c.env.DB, c.req.param("id"), session.account_id, updates);
  if (!postback) return c.json({ error: "Not found" }, 404);
  return c.json({ postback });
});

postbacks.delete("/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const ok = await deletePostback(c.env.DB, c.req.param("id"), session.account_id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export { postbacks };
