import { Hono } from "hono";
import {
  createAffiliateWithUniqueCode,
  createProgram,
  getProgram,
  getProgramStats,
  listAffiliates,
  listClickLog,
  listConversionLog,
  listPrograms,
  updateProgram,
} from "../db/queries";
import type { Env } from "../types";
import { entityBelongsTo, withUniqueCampaignKey } from "../db/entities";
import { apiKey, convertSecret, id, slugify } from "../lib/utils";
import {
  buildCampaignUrl,
  buildPostbackUrl,
  buildTrackingUrl,
  parseHttpUrl,
} from "../lib/urls";
import { requireUser, requireWrite } from "../lib/access";
import { campaignTrackingBaseUrl, getCampaignTrackingDomain } from "../db/tracking-domains";

const programs = new Hono<{ Bindings: Env }>();

programs.get("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const items = await listPrograms(c.env.DB, session.account_id);
  return c.json({ programs: items });
});

programs.post("/", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req.json<{
    name?: string;
    destination_url?: string;
    traffic_source_id?: string;
  }>();
  const name = body.name?.trim();
  const destinationRaw = body.destination_url?.trim();
  if (!name) return c.json({ error: "Program name required" }, 400);

  // Optional: a campaign can route only through paths (offers/landers).
  const destination = destinationRaw ? parseHttpUrl(destinationRaw) : null;
  if (destinationRaw && !destination) {
    return c.json({ error: "Destination URL must be http/https" }, 400);
  }

  const trafficSourceId = body.traffic_source_id?.trim() || null;
  if (
    trafficSourceId &&
    !(await entityBelongsTo(c.env.DB, "traffic_source", trafficSourceId, session.account_id))
  ) {
    return c.json({ error: "Invalid traffic_source_id" }, 400);
  }

  const secret = convertSecret();
  const base = {
    id: id("prg"),
    user_id: session.account_id,
    name,
    slug: slugify(name),
    api_key: apiKey(),
    destination_url: destination?.toString() ?? null,
    convert_secret: secret,
    group_id: null,
    traffic_source_id: trafficSourceId,
    tags: null,
    status: "active",
    created_at: Date.now(),
  };
  const program = await withUniqueCampaignKey(name, async (campaign_key) => {
    const candidate = { ...base, campaign_key };
    await createProgram(c.env.DB, candidate);
    return candidate;
  });
  const { convert_secret: _secret, ...publicProgram } = program;
  return c.json({ program: publicProgram, convert_secret: secret }, 201);
});

programs.patch("/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req.json<{
    name?: string;
    destination_url?: string | null;
  }>();
  const updates: { name?: string; destination_url?: string | null } = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return c.json({ error: "Program name cannot be empty" }, 400);
    updates.name = name;
  }

  if (body.destination_url !== undefined) {
    const raw = body.destination_url?.trim();
    const destination = raw ? parseHttpUrl(raw) : null;
    if (raw && !destination) {
      return c.json({ error: "Destination URL must be http/https" }, 400);
    }
    updates.destination_url = destination?.toString() ?? null;
  }

  const program = await updateProgram(c.env.DB, c.req.param("id"), session.account_id, updates);
  if (!program) return c.json({ error: "Not found" }, 404);
  return c.json({ program });
});

programs.get("/:id", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);
  return c.json({ program });
});

programs.get("/:id/stats", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const stats = await getProgramStats(c.env.DB, program);
  return c.json(stats);
});

programs.get("/:id/affiliates", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const affiliates = await listAffiliates(c.env.DB, program.id);
  return c.json({ affiliates });
});

programs.post("/:id/affiliates", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();
  if (!name) return c.json({ error: "Affiliate name required" }, 400);

  const affiliate = await createAffiliateWithUniqueCode(c.env.DB, {
    program_id: program.id,
    name,
  });

  const base = await campaignTrackingBaseUrl(c.env.DB, c.env.APP_URL, program.id);
  const trackingUrl = buildTrackingUrl(base, affiliate.code);
  return c.json({ affiliate, tracking_url: trackingUrl }, 201);
});

programs.get("/:id/tracking", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  // Campaign links use the campaign's custom tracking domain when one is set.
  const domain = await getCampaignTrackingDomain(c.env.DB, program.id);
  const base = domain ? `https://${domain.hostname}` : c.env.APP_URL;
  return c.json({
    tracking: {
      postback_url: buildPostbackUrl(base),
      campaign_url: program.campaign_key ? buildCampaignUrl(base, program.campaign_key) : null,
      tracking_domain: domain ? { id: domain.id, hostname: domain.hostname } : null,
      offer_url_macro: "{click_id}",
      redirect_params: ["velo_ref", "click_id"],
    },
  });
});

programs.get("/:id/clicks", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const clicks = await listClickLog(c.env.DB, program.id, limit, offset);
  return c.json({ clicks });
});

programs.get("/:id/conversions", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const conversions = await listConversionLog(c.env.DB, program.id, limit, offset);
  return c.json({ conversions });
});

export { programs };
