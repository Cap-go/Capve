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
  type LogPage,
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
import { canWrite, requireUser, requireWrite } from "../lib/access";
import { ensurePostbackKey } from "../db/postback-key";

const programs = new Hono<{ Bindings: Env }>();

/** Paging + optional created_at window (Unix ms) for the click and conversion logs. */
function logPage(query: Record<string, string>): LogPage {
  const int = (value: string | undefined) => {
    const n = Number(value);
    return value !== undefined && value !== "" && Number.isFinite(n) ? Math.trunc(n) : undefined;
  };
  return {
    limit: Math.min(Math.max(int(query.limit) ?? 50, 1), 200),
    offset: Math.max(int(query.offset) ?? 0, 0),
    from: int(query.from),
    to: int(query.to),
  };
}

programs.get("/", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  // Deleted campaigns are archived (kept for reports) and hidden from the list.
  const items = (await listPrograms(c.env.DB, session.account_id)).filter(
    (program) => program.status !== "archived",
  );
  return c.json({ programs: items });
});

programs.post("/", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req.json<{
    name?: string;
    destination_url?: string;
    traffic_source_id?: string;
    group_id?: string;
  }>();
  const name = body.name?.trim();
  const destinationRaw = body.destination_url?.trim();
  if (!name) return c.json({ error: "Campaign name required" }, 400);

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
  const groupId = body.group_id?.trim() || null;
  if (groupId && !(await entityBelongsTo(c.env.DB, "group", groupId, session.account_id))) {
    return c.json({ error: "Invalid group_id" }, 400);
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
    group_id: groupId,
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
    traffic_source_id?: string | null;
    group_id?: string | null;
    status?: string;
  }>();
  const updates: {
    name?: string;
    destination_url?: string | null;
    traffic_source_id?: string | null;
    group_id?: string | null;
    status?: string;
  } = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return c.json({ error: "Campaign name cannot be empty" }, 400);
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

  if (body.traffic_source_id !== undefined) {
    const sourceId = body.traffic_source_id?.trim() || null;
    if (
      sourceId &&
      !(await entityBelongsTo(c.env.DB, "traffic_source", sourceId, session.account_id))
    ) {
      return c.json({ error: "Invalid traffic_source_id" }, 400);
    }
    updates.traffic_source_id = sourceId;
  }

  if (body.group_id !== undefined) {
    const groupId = body.group_id?.trim() || null;
    if (groupId && !(await entityBelongsTo(c.env.DB, "group", groupId, session.account_id))) {
      return c.json({ error: "Invalid group_id" }, 400);
    }
    updates.group_id = groupId;
  }

  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "paused") {
      return c.json({ error: "status must be active or paused" }, 400);
    }
    updates.status = body.status;
  }

  const program = await updateProgram(c.env.DB, c.req.param("id"), session.account_id, updates);
  if (!program) return c.json({ error: "Not found" }, 404);
  return c.json({ program });
});

/**
 * Deletes a campaign by archiving it: links stop redirecting and it leaves the campaign
 * list, while its clicks and conversions stay in reports.
 */
programs.delete("/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const existing = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!existing || existing.status === "archived") return c.json({ error: "Not found" }, 404);
  await updateProgram(c.env.DB, existing.id, session.account_id, { status: "archived" });
  return c.json({ ok: true });
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

  const trackingUrl = buildTrackingUrl(c.env.APP_URL, affiliate.code);
  return c.json({ affiliate, tracking_url: trackingUrl }, 201);
});

programs.get("/:id/tracking", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  // The postback key lets anyone record conversions: only owners/admins see it.
  const postbackKey = await ensurePostbackKey(c.env.DB, session.account_id);
  const showKey = canWrite(session.role);
  return c.json({
    tracking: {
      postback_url: buildPostbackUrl(c.env.APP_URL, showKey ? postbackKey.key : undefined),
      postback_key_required: postbackKey.required,
      campaign_url: program.campaign_key
        ? buildCampaignUrl(c.env.APP_URL, program.campaign_key)
        : null,
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

  const clicks = await listClickLog(c.env.DB, program.id, logPage(c.req.query()));
  return c.json({ clicks });
});

programs.get("/:id/conversions", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const program = await getProgram(c.env.DB, c.req.param("id"), session.account_id);
  if (!program) return c.json({ error: "Not found" }, 404);

  const conversions = await listConversionLog(c.env.DB, program.id, logPage(c.req.query()));
  return c.json({ conversions });
});

export { programs };
