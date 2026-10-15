import { Hono } from "hono";
import {
  getAffiliateByCode,
  getOfferForUser,
  getProgramById,
  getTrackedClick,
  isUniqueVisitor,
  markLpClick,
  recordClick,
} from "../db/queries";
import { getTriggersForEvent } from "../db/ops";
import {
  getOrCreateCampaignAffiliate,
  getOrCreateRotation,
  getProgramByCampaignKey,
  getRotationConfig,
} from "../db/routing";
import type { Env } from "../types";
import { affiliateCookie, isSecureRequest } from "../lib/auth";
import {
  fallbackDestination,
  newVisitorKey,
  readVisitorKey,
  resolvePathDestination,
  selectPath,
  substituteMacros,
  visitorCookie,
} from "../lib/routing";
import { fireTriggerWebhooks } from "../lib/triggers";
import { id } from "../lib/utils";
import { parseHttpUrl, resolveRedirectTarget, withQueryParam } from "../lib/urls";
import { buildClickContext, SUB_KEYS } from "../lib/click-context";
import type { RoutingContext } from "../types-routing";

import type { Context } from "hono";

type AppContext = { Bindings: Env };

const UNIQUE_WINDOW_MS = 24 * 60 * 60 * 1000;

function lpClickUrl(appUrl: string | undefined, requestUrl: string, clickId: string): string {
  const base = (appUrl?.trim() || new URL(requestUrl).origin).replace(/\/$/, "");
  return `${base}/lp/${clickId}`;
}

async function handleClickRedirect(
  c: Context<AppContext>,
  program: { id: string; destination_url: string | null; campaign_key: string | null },
  affiliate: { id: string; code: string },
) {
  // Destination is optional: campaigns can route only through paths.
  let baseDestination: string | null = null;
  if (program.destination_url || c.req.query("url")) {
    const resolved = resolveRedirectTarget(program.destination_url, c.req.query("url"));
    if (!resolved.ok) {
      return c.text(resolved.error, resolved.status as 400 | 503);
    }
    baseDestination = resolved.url.toString();
  }

  const clickId = id("clk");
  const secure = isSecureRequest(new URL(c.req.url));
  const cookieHeader = c.req.header("cookie") ?? null;
  let visitorKey = readVisitorKey(cookieHeader);
  const setVisitorCookie = !visitorKey;
  if (!visitorKey) visitorKey = newVisitorKey();

  const clickContext = await buildClickContext(c.req.raw);
  const ctx: RoutingContext = {
    click_id: clickId,
    velo_ref: affiliate.code,
    campaign_key: program.campaign_key,
    campaign_id: program.id,
    country: clickContext.country,
    external_id: clickContext.external_id,
    lp_click_url: lpClickUrl(c.env.APP_URL, c.req.url, clickId),
    subs: Object.fromEntries(SUB_KEYS.map((key) => [key, clickContext[key]])),
  };

  const config = await getRotationConfig(c.env.DB, program.id);
  let destination = fallbackDestination(baseDestination, ctx);
  let pathId: string | null = null;
  let landerId: string | null = null;
  let offerId: string | null = null;

  if (config.paths.length > 0) {
    const path = await selectPath(c.env.DB, config.rotation, config.paths, {
      programId: program.id,
      visitorKey,
    });
    if (path) {
      const pathDest = resolvePathDestination(path, baseDestination, ctx);
      if ("url" in pathDest) {
        destination = pathDest;
        pathId = pathDest.path_id;
        landerId = pathDest.lander_id;
        offerId = pathDest.offer_id;
      }
    }
  }

  if ("error" in destination) {
    return c.text(destination.error, 503);
  }

  const now = Date.now();
  const { is_bot, ...contextColumns } = clickContext;
  await recordClick(c.env.DB, {
    ...contextColumns,
    id: clickId,
    program_id: program.id,
    affiliate_id: affiliate.id,
    path_id: pathId,
    lander_id: landerId,
    offer_id: offerId,
    is_unique: await isUniqueVisitor(
      c.env.DB,
      program.id,
      clickContext.visitor_hash,
      now - UNIQUE_WINDOW_MS,
    ),
    is_bot,
    created_at: now,
  });

  const programFull = await getProgramById(c.env.DB, program.id);
  if (programFull) {
    const clickTriggers = await getTriggersForEvent(
      c.env.DB,
      programFull.user_id,
      program.id,
      "click",
    );
    await fireTriggerWebhooks(clickTriggers, {
      click_id: clickId,
      velo_ref: affiliate.code,
      campaign_key: program.campaign_key,
      program_id: program.id,
    });
  }

  const headers = new Headers();
  headers.set("Location", destination.url.toString());
  headers.append("Set-Cookie", affiliateCookie(affiliate.code, secure));
  if (setVisitorCookie) {
    headers.append("Set-Cookie", visitorCookie(visitorKey, secure));
  }

  return new Response(null, { status: 302, headers });
}

const redirect = new Hono<AppContext>();

redirect.get("/:code", async (c) => {
  const code = c.req.param("code");
  const affiliate = await getAffiliateByCode(c.env.DB, code);
  if (!affiliate) {
    return c.text("Affiliate link not found", 404);
  }

  const program = await getProgramById(c.env.DB, affiliate.program_id);
  if (!program) {
    return c.text("Program not found", 404);
  }
  if (program.status !== "active") {
    return c.text("Campaign not found", 404);
  }

  return handleClickRedirect(c, program, affiliate);
});

const campaign = new Hono<AppContext>();

campaign.get("/:key", async (c) => {
  const key = c.req.param("key");
  const program = await getProgramByCampaignKey(c.env.DB, key);
  if (!program || program.status !== "active") {
    return c.text("Campaign not found", 404);
  }

  const affiliate = await getOrCreateCampaignAffiliate(c.env.DB, program.id, key);
  await getOrCreateRotation(c.env.DB, program.id);

  return handleClickRedirect(
    c,
    { ...program, campaign_key: program.campaign_key ?? key },
    affiliate,
  );
});

/**
 * LP click: the lander links to `/lp/{click_id}` (macro `{lp_click_url}`). Marks the click's
 * LP click and redirects to the offer chosen for the click's path at click time.
 * Only configured offer URLs are ever used as targets.
 */
const lp = new Hono<AppContext>();

lp.get("/:clickId", async (c) => {
  const click = await getTrackedClick(c.env.DB, c.req.param("clickId"));
  if (!click?.offer_id) {
    return c.text("Offer not found", 404);
  }

  const program = await getProgramById(c.env.DB, click.program_id);
  if (!program || program.status !== "active") {
    return c.text("Campaign not found", 404);
  }

  const offer = await getOfferForUser(c.env.DB, click.offer_id, program.user_id);
  const affiliate = await c.env.DB.prepare("SELECT code FROM affiliates WHERE id = ?")
    .bind(click.affiliate_id)
    .first<{ code: string }>();
  if (!offer || !affiliate) {
    return c.text("Offer not found", 404);
  }

  const ctx: RoutingContext = {
    click_id: click.id,
    velo_ref: affiliate.code,
    campaign_key: program.campaign_key,
    campaign_id: program.id,
    offer_id: click.offer_id,
    lander_id: click.lander_id,
    country: click.country,
    external_id: click.external_id,
    subs: Object.fromEntries(SUB_KEYS.map((key) => [key, click[key]])),
  };
  const parsed = parseHttpUrl(substituteMacros(offer.url, ctx));
  if (!parsed) {
    return c.text("Invalid offer URL", 503);
  }

  await markLpClick(c.env.DB, click.id, Date.now());

  let url = withQueryParam(parsed, "velo_ref", affiliate.code);
  url = withQueryParam(url, "click_id", click.id);
  return c.redirect(url.toString(), 302);
});

export { redirect, campaign, lp };
