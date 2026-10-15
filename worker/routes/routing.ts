import { Hono } from "hono";
import {
  createPath,
  createRule,
  deletePath,
  deleteRule,
  getPathById,
  getRotationConfig,
  getRule,
  updatePath,
  updateRotation,
  updateRule,
  type PathItemInput,
} from "../db/routing";
import { getTrafficFilter, saveTrafficFilter } from "../db/antifraud";
import { entityBelongsTo } from "../db/entities";
import { getProgram } from "../db/queries";
import type { Env } from "../types";
import type { FlowType, RotationMode } from "../types-routing";
import { requireUser, requireWrite } from "../lib/access";
import type { BotAction } from "../lib/antifraud";
import { isValidTimezone, parseConditions } from "../lib/rules";
import { parseHttpUrl } from "../lib/urls";

const routing = new Hono<{ Bindings: Env }>();

const MAX_PATH_ITEMS = 50;

type PathBody = {
  name?: string;
  flow_type?: FlowType;
  weight?: number;
  sort_order?: number;
  direct_url?: string | null;
  lander_id?: string | null;
  offer_id?: string | null;
  enabled?: boolean;
  rule_id?: string | null;
  landers?: unknown;
  offers?: unknown;
};

/** Parses `[{ lander_id | offer_id, weight }]`; undefined when absent. */
function parseItems(
  raw: unknown,
  key: "lander_id" | "offer_id",
): PathItemInput[] | undefined | { error: string } {
  if (raw === undefined || raw === null) return undefined;
  const label = key === "lander_id" ? "landers" : "offers";
  if (!Array.isArray(raw) || raw.length > MAX_PATH_ITEMS) return { error: `Invalid ${label}` };
  const items: PathItemInput[] = [];
  for (const entry of raw) {
    const value = (entry as Record<string, unknown> | null)?.[key];
    const weight = (entry as Record<string, unknown> | null)?.weight ?? 100;
    if (typeof value !== "string" || !value.trim()) return { error: `Invalid ${label}: ${key} required` };
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 1) {
      return { error: `Invalid ${label}: weight must be >= 1` };
    }
    items.push({ id: value.trim(), weight: Math.round(weight) });
  }
  return items;
}

/** Validates URLs, weighted items and lander/offer ownership. Mutates body into a clean input. */
async function parsePathBody(
  db: D1Database,
  accountId: string,
  body: PathBody,
): Promise<
  | { error: string }
  | { input: Omit<PathBody, "landers" | "offers"> & { landers?: PathItemInput[]; offers?: PathItemInput[] } }
> {
  if (body.direct_url) {
    const url = parseHttpUrl(body.direct_url);
    if (!url) return { error: "Invalid direct_url" };
    body.direct_url = url.toString();
  }
  const landers = parseItems(body.landers, "lander_id");
  if (landers && "error" in landers) return landers;
  const offers = parseItems(body.offers, "offer_id");
  if (offers && "error" in offers) return offers;

  const landerIds = [...(landers ?? []).map((l) => l.id), ...(body.lander_id ? [body.lander_id] : [])];
  const offerIds = [...(offers ?? []).map((o) => o.id), ...(body.offer_id ? [body.offer_id] : [])];
  for (const landerId of new Set(landerIds)) {
    if (!(await entityBelongsTo(db, "lander", landerId, accountId))) return { error: "Invalid lander_id" };
  }
  for (const offerId of new Set(offerIds)) {
    if (!(await entityBelongsTo(db, "offer", offerId, accountId))) return { error: "Invalid offer_id" };
  }
  const { landers: _l, offers: _o, ...rest } = body;
  return { input: { ...rest, landers: landers as PathItemInput[] | undefined, offers: offers as PathItemInput[] | undefined } };
}

routing.get("/:id/rotation", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const config = await getRotationConfig(c.env.DB, program.id);
  return c.json(config);
});

routing.put("/:id/rotation", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<{ mode?: RotationMode; fixed_path_id?: string | null }>();
  const validModes: RotationMode[] = ["normal", "smart", "fix_on", "top_to_bottom"];
  if (body.mode && !validModes.includes(body.mode)) {
    return c.json({ error: "Invalid rotation mode" }, 400);
  }
  if (body.fixed_path_id && !(await getPathById(c.env.DB, body.fixed_path_id, program.id))) {
    return c.json({ error: "Invalid fixed_path_id" }, 400);
  }

  const rotation = await updateRotation(c.env.DB, program.id, {
    mode: body.mode,
    fixed_path_id: body.fixed_path_id,
  });
  const config = await getRotationConfig(c.env.DB, program.id);
  return c.json({ rotation, paths: config.paths, rules: config.rules });
});

routing.post("/:id/paths", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<PathBody>();

  const name = body.name?.trim();
  if (!name) return c.json({ error: "Path name required" }, 400);

  const validFlows: FlowType[] = ["direct", "lander", "lander_offer", "offer"];
  if (!body.flow_type || !validFlows.includes(body.flow_type)) {
    return c.json({ error: "Valid flow_type required" }, 400);
  }

  if (body.rule_id && !(await getRule(c.env.DB, body.rule_id, program.id))) {
    return c.json({ error: "Invalid rule_id" }, 400);
  }

  const parsed = await parsePathBody(c.env.DB, session.account_id, body);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const input = parsed.input;

  const path = await createPath(c.env.DB, program.id, {
    name,
    flow_type: body.flow_type,
    weight: input.weight,
    sort_order: input.sort_order,
    direct_url: input.direct_url ?? null,
    lander_id: input.lander_id ?? null,
    offer_id: input.offer_id ?? null,
    landers: input.landers,
    offers: input.offers,
    enabled: input.enabled,
    rule_id: input.rule_id ?? null,
  });

  return c.json({ path }, 201);
});

routing.patch("/:id/paths/:pathId", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<PathBody>();
  const parsed = await parsePathBody(c.env.DB, session.account_id, body);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  // A path's rule is fixed at creation.
  const { rule_id: _ruleId, ...updates } = parsed.input;

  const path = await updatePath(c.env.DB, c.req.param("pathId"), program.id, updates);
  if (!path) return c.json({ error: "Not found" }, 404);
  return c.json({ path });
});

routing.delete("/:id/paths/:pathId", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const deleted = await deletePath(c.env.DB, c.req.param("pathId"), program.id);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// Routing rules: ordered, conditions AND-ed, first match wins, own paths (rule_id).

type RuleBody = {
  name?: string;
  conditions?: unknown;
  timezone?: string;
  sort_order?: number;
  enabled?: boolean;
};

function parseRuleBody(body: RuleBody) {
  const parsed = body.conditions === undefined ? undefined : parseConditions(body.conditions);
  if (parsed && "error" in parsed) return { error: parsed.error };
  const timezone = body.timezone?.trim();
  if (timezone && !isValidTimezone(timezone)) return { error: "Invalid timezone" };
  if (body.sort_order !== undefined && !Number.isInteger(body.sort_order)) {
    return { error: "Invalid sort_order" };
  }
  return {
    input: {
      name: body.name?.trim() || undefined,
      conditions: parsed?.conditions,
      timezone: timezone || undefined,
      sort_order: body.sort_order,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    },
  };
}

routing.get("/:id/rules", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const config = await getRotationConfig(c.env.DB, program.id);
  return c.json({ rules: config.rules });
});

routing.post("/:id/rules", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const parsed = parseRuleBody(await c.req.json<RuleBody>());
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  if (!parsed.input.name) return c.json({ error: "Rule name required" }, 400);

  const rule = await createRule(c.env.DB, program.id, {
    ...parsed.input,
    name: parsed.input.name,
    conditions: parsed.input.conditions ?? [],
  });
  return c.json({ rule: { ...rule, paths: [] } }, 201);
});

routing.patch("/:id/rules/:ruleId", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const parsed = parseRuleBody(await c.req.json<RuleBody>());
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);

  const rule = await updateRule(c.env.DB, c.req.param("ruleId"), program.id, parsed.input);
  if (!rule) return c.json({ error: "Not found" }, 404);
  return c.json({ rule });
});

routing.delete("/:id/rules/:ruleId", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const deleted = await deleteRule(c.env.DB, c.req.param("ruleId"), program.id);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// Bot / blocked traffic handling for the campaign.

routing.get("/:id/traffic-filter", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  return c.json({ filter: await getTrafficFilter(c.env.DB, program.id) });
});

routing.put("/:id/traffic-filter", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<{
    bot_action?: BotAction;
    safe_page_url?: string | null;
    block_datacenter?: boolean;
  }>();
  const current = await getTrafficFilter(c.env.DB, program.id);

  if (body.bot_action !== undefined && body.bot_action !== "route" && body.bot_action !== "safe_page") {
    return c.json({ error: "bot_action must be route or safe_page" }, 400);
  }
  let safePage = current.safe_page_url;
  if (body.safe_page_url !== undefined) {
    const raw = body.safe_page_url?.trim();
    if (!raw) {
      safePage = null;
    } else {
      const url = parseHttpUrl(raw);
      if (!url) return c.json({ error: "Invalid safe_page_url" }, 400);
      safePage = url.toString();
    }
  }
  const botAction = body.bot_action ?? current.bot_action;
  if (botAction === "safe_page" && !safePage) {
    return c.json({ error: "safe_page_url required for bot_action safe_page" }, 400);
  }

  const filter = await saveTrafficFilter(c.env.DB, {
    program_id: program.id,
    bot_action: botAction,
    safe_page_url: safePage,
    block_datacenter:
      typeof body.block_datacenter === "boolean" ? body.block_datacenter : current.block_datacenter,
  });
  return c.json({ filter });
});

export { routing };
