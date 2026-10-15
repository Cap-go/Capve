import { Hono } from "hono";
import {
  createAffiliateNetwork,
  createTrafficSource,
  entityBelongsTo,
} from "../db/entities";
import { createPostback } from "../db/postbacks";
import { getProgram } from "../db/queries";
import {
  COST_FILTER_DIMS,
  applyCostUpdate,
  getSourceSettingsRow,
  getSourceTokens,
  isCostFilterDim,
  listCostUpdates,
  publicSettings,
  recordSyncResult,
  upsertSourceSettings,
  type CostFilter,
} from "../db/sources";
import { COST_PROVIDERS } from "../cron/cost-providers";
import { syncSourceCost } from "../cron/cost-sync";
import { requireUser, requireWrite } from "../lib/access";
import { sealSecret } from "../lib/secret-box";
import {
  NETWORK_TEMPLATES,
  SOURCE_TEMPLATES,
  findNetworkTemplate,
  findSourceTemplate,
  networkPostbackUrls,
  parseTokens,
  tokenLabels,
  trackingUrlWithMacros,
} from "../lib/source-templates";
import { buildCampaignUrl } from "../lib/urls";
import type { Env } from "../types";

type AppEnv = { Bindings: Env };

/** `/api/sources/*`: traffic source / network templates, tokens and cost API settings. */
const sources = new Hono<AppEnv>();

sources.get("/templates", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({
    traffic_sources: SOURCE_TEMPLATES,
    networks: NETWORK_TEMPLATES.map((t) => ({
      ...t,
      incoming_postback_urls: networkPostbackUrls(c.env.APP_URL, t),
      offer_url_suffix: `${t.offer_param}={click_id}`,
    })),
    cost_providers: Object.values(COST_PROVIDERS).map(({ id, name }) => ({ id, name })),
  });
});

sources.post("/from-template", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req
    .json<{ template_id?: string; name?: string; default_cost_cents?: number }>()
    .catch(() => ({}) as { template_id?: string; name?: string; default_cost_cents?: number });
  const template = body.template_id ? findSourceTemplate(body.template_id) : undefined;
  if (!template) return c.json({ error: "Unknown template_id" }, 400);

  const source = await createTrafficSource(c.env.DB, session.account_id, {
    name: body.name?.trim() || template.name,
    cost_type: template.cost_type,
    default_cost_cents:
      Number.isInteger(body.default_cost_cents) && body.default_cost_cents! >= 0
        ? body.default_cost_cents
        : 0,
  });
  const settings = await upsertSourceSettings(c.env.DB, session.account_id, source.id, {
    template: template.id,
    tokens: template.tokens,
    api_provider: template.cost_api ?? null,
  });
  const postback = template.postback_url
    ? await createPostback(
        c.env.DB,
        session.account_id,
        { kind: "traffic_source", id: source.id },
        { event: null, url: template.postback_url },
      )
    : null;
  return c.json({ traffic_source: source, settings, postback }, 201);
});

sources.post("/networks/from-template", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const body = await c.req
    .json<{ template_id?: string; name?: string }>()
    .catch(() => ({}) as { template_id?: string; name?: string });
  const template = body.template_id ? findNetworkTemplate(body.template_id) : undefined;
  if (!template) return c.json({ error: "Unknown template_id" }, 400);
  const network = await createAffiliateNetwork(c.env.DB, session.account_id, {
    name: body.name?.trim() || template.name,
  });
  return c.json(
    {
      network,
      template: template.id,
      incoming_postback_urls: networkPostbackUrls(c.env.APP_URL, template),
      offer_url_suffix: `${template.offer_param}={click_id}`,
    },
    201,
  );
});

sources.get("/:id/settings", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const sourceId = c.req.param("id");
  if (!(await entityBelongsTo(c.env.DB, "traffic_source", sourceId, session.account_id))) {
    return c.json({ error: "Not found" }, 404);
  }
  const row = await getSourceSettingsRow(c.env.DB, sourceId);
  return c.json({ settings: publicSettings(row, sourceId) });
});

sources.put("/:id/settings", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const sourceId = c.req.param("id");
  if (!(await entityBelongsTo(c.env.DB, "traffic_source", sourceId, session.account_id))) {
    return c.json({ error: "Not found" }, 404);
  }
  const body = await c.req
    .json<{ tokens?: unknown; api_provider?: string | null; api_key?: string | null }>()
    .catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const patch: Parameters<typeof upsertSourceSettings>[3] = {};
  if (body.tokens !== undefined) {
    const tokens = parseTokens(body.tokens);
    if (typeof tokens === "string") return c.json({ error: tokens }, 400);
    patch.tokens = tokens;
  }
  if (body.api_provider !== undefined) {
    if (body.api_provider !== null && !COST_PROVIDERS[body.api_provider]) {
      return c.json({ error: `api_provider must be one of: ${Object.keys(COST_PROVIDERS).join(", ")}` }, 400);
    }
    patch.api_provider = body.api_provider;
  }
  if (body.api_key !== undefined) {
    const key = typeof body.api_key === "string" ? body.api_key.trim() : "";
    if (key.length > 500) return c.json({ error: "api_key too long" }, 400);
    patch.api_key_sealed = key ? await sealSecret(key, c.env.AUTH_SECRET) : null;
  }
  const settings = await upsertSourceSettings(c.env.DB, session.account_id, sourceId, patch);
  return c.json({ settings });
});

sources.post("/:id/sync-cost", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const sourceId = c.req.param("id");
  if (!(await entityBelongsTo(c.env.DB, "traffic_source", sourceId, session.account_id))) {
    return c.json({ error: "Not found" }, 404);
  }
  const row = await getSourceSettingsRow(c.env.DB, sourceId);
  if (!row?.api_provider || !row.api_key_sealed) {
    return c.json({ error: "Set api_provider and api_key first" }, 400);
  }
  const body = await c.req.json<{ date?: string }>().catch(() => ({}) as { date?: string });
  const date = body.date?.trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  }
  try {
    const result = await syncSourceCost(c.env, row, date ? { days: [date] } : {});
    await recordSyncResult(c.env.DB, sourceId, null);
    return c.json({ result });
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await recordSyncResult(c.env.DB, sourceId, message);
    return c.json({ error: message }, 502);
  }
});

/** `/api/campaigns/:id/*`: source tracking link and cost updates for one campaign. */
const campaignCosts = new Hono<AppEnv>();

campaignCosts.get("/:id/source-link", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);
  const tokens = program.traffic_source_id
    ? await getSourceTokens(c.env.DB, program.traffic_source_id)
    : [];
  const campaignUrl = program.campaign_key
    ? buildCampaignUrl(c.env.APP_URL, program.campaign_key)
    : null;
  return c.json({
    traffic_source_id: program.traffic_source_id,
    campaign_url: campaignUrl,
    tracking_url: campaignUrl ? trackingUrlWithMacros(campaignUrl, tokens) : null,
    tokens,
    labels: tokenLabels(tokens),
  });
});

campaignCosts.get("/:id/costs", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);
  return c.json({
    cost_updates: await listCostUpdates(
      c.env.DB,
      session.account_id,
      program.id,
      program.traffic_source_id,
    ),
  });
});

/** Unix ms, or ISO date/time. A date-only `to` means the end of that UTC day. */
function parseTime(value: unknown, endOfDay = false): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  if (Number.isNaN(ms)) return null;
  return endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text) ? ms + 86_400_000 - 1 : ms;
}

campaignCosts.post("/:id/costs", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);
  const body = await c.req
    .json<{
      date?: string;
      from?: string | number;
      to?: string | number;
      total_cents?: number;
      total?: number | string;
      filter_dim?: string;
      filter_value?: string;
    }>()
    .catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const from = parseTime(body.date ?? body.from);
  const to = parseTime(body.date ?? body.to, true);
  if (from == null || to == null || to < from) {
    return c.json({ error: "Give date (YYYY-MM-DD) or from/to (ISO or Unix ms), with from <= to" }, 400);
  }

  const totalCents =
    body.total_cents !== undefined ? Number(body.total_cents) : Math.round(Number(body.total) * 100);
  if (!Number.isInteger(totalCents) || totalCents < 0 || totalCents > 1e12) {
    return c.json({ error: "total_cents (integer) or total (currency units) required, >= 0" }, 400);
  }

  const filters: CostFilter[] = [];
  const dimRaw = body.filter_dim?.trim();
  if (dimRaw) {
    const value = body.filter_value?.trim();
    if (!value) return c.json({ error: "filter_value required with filter_dim" }, 400);
    let dim: string = dimRaw;
    if (!isCostFilterDim(dim) && program.traffic_source_id) {
      // Allow the source's token param (e.g. "zoneid") instead of the slot.
      const token = (await getSourceTokens(c.env.DB, program.traffic_source_id)).find(
        (t) => t.param === dimRaw,
      );
      if (token) dim = token.slot;
    }
    if (!isCostFilterDim(dim)) {
      return c.json(
        { error: `filter_dim must be a source token param or one of: ${COST_FILTER_DIMS.join(", ")}` },
        400,
      );
    }
    filters.push({ dim, value });
  }

  const update = await applyCostUpdate(c.env.DB, {
    userId: session.account_id,
    programId: program.id,
    trafficSourceId: program.traffic_source_id,
    from,
    to,
    filters,
    totalCents,
  });
  return c.json({ cost_update: update }, 201);
});

export { sources, campaignCosts };
