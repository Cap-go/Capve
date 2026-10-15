import type { PathWithEntities, ResolvedDestination, Rotation, RoutingContext } from "../types-routing";
import {
  getVisitorAssignment,
  nextRotationIndex,
  setVisitorAssignment,
} from "../db/routing";
import type { Defer } from "./background";
import { parseHttpUrl, withQueryParam } from "./urls";

const VISITOR_COOKIE = "_capve_vid";

export function visitorCookie(visitorKey: string, secure: boolean): string {
  const parts = [
    `${VISITOR_COOKIE}=${encodeURIComponent(visitorKey)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 365}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readVisitorKey(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const raw = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${VISITOR_COOKIE}=`))
    ?.slice(VISITOR_COOKIE.length + 1);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function newVisitorKey(): string {
  return `v_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function enabledPaths(paths: PathWithEntities[]): PathWithEntities[] {
  return paths.filter((p) => p.enabled);
}

/** Weighted random pick; paths with weight 0 never receive traffic. */
function weightedPick(paths: PathWithEntities[]): PathWithEntities | null {
  const pool = enabledPaths(paths).filter((p) => p.weight > 0);
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const path of pool) {
    roll -= path.weight;
    if (roll < 0) return path;
  }
  return pool[pool.length - 1] ?? null;
}

function topToBottomPick(paths: PathWithEntities[], clickIndex: number): PathWithEntities | null {
  const pool = enabledPaths(paths).sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at);
  if (pool.length === 0) return null;
  return pool[clickIndex % pool.length] ?? null;
}

export async function selectPath(
  db: D1Database,
  rotation: Rotation,
  paths: PathWithEntities[],
  opts: { programId: string; visitorKey: string | null; defer?: Defer },
): Promise<PathWithEntities | null> {
  const pool = enabledPaths(paths);
  if (pool.length === 0) return null;

  if (rotation.mode === "fix_on") {
    if (rotation.fixed_path_id) {
      const fixed = pool.find((p) => p.id === rotation.fixed_path_id);
      if (fixed) return fixed;
    }
    return pool[0] ?? null;
  }

  if (rotation.mode === "top_to_bottom") {
    const index = await nextRotationIndex(db, rotation.id);
    return topToBottomPick(paths, index);
  }

  if (rotation.mode === "smart" || rotation.mode === "normal") {
    if (opts.visitorKey && rotation.mode === "smart") {
      const assignedId = await getVisitorAssignment(db, opts.programId, opts.visitorKey);
      if (assignedId) {
        const assigned = pool.find((p) => p.id === assignedId);
        if (assigned) return assigned;
      }
    }

    const picked = rotation.mode === "normal" ? weightedPick(paths) : weightedPick(paths);
    if (!picked) return null;

    if (opts.visitorKey && rotation.mode === "smart") {
      const write = setVisitorAssignment(db, opts.programId, opts.visitorKey, picked.id);
      // Sticky assignment only matters for the visitor's next click: do not block this one.
      if (opts.defer) opts.defer(write);
      else await write;
    }
    return picked;
  }

  return weightedPick(paths);
}

/** Binom-style URL macros: values are URL-encoded; unknown macros are left untouched. */
export function substituteMacros(url: string, ctx: RoutingContext): string {
  const values: Record<string, string> = {
    click_id: ctx.click_id,
    clickid: ctx.click_id,
    velo_ref: ctx.velo_ref,
    campaign_key: ctx.campaign_key ?? "",
    campaign_id: ctx.campaign_id ?? "",
    offer_id: ctx.offer_id ?? "",
    lander_id: ctx.lander_id ?? "",
    country: ctx.country ?? "",
    external_id: ctx.external_id ?? "",
    lp_click_url: ctx.lp_click_url ?? "",
  };
  for (let i = 1; i <= 10; i++) {
    values[`sub${i}`] = ctx.subs?.[`sub${i}`] ?? "";
  }
  return url.replace(/\{([a-z0-9_]+)\}/gi, (match, name: string) => {
    const value = values[name.toLowerCase()];
    return value === undefined ? match : encodeURIComponent(value);
  });
}

export function resolvePathDestination(
  path: PathWithEntities,
  fallbackDestination: string | null,
  ctx: RoutingContext,
): ResolvedDestination | { error: string } {
  let raw: string | null = null;
  let landerId: string | null = null;
  let offerId: string | null = null;

  switch (path.flow_type) {
    case "direct":
      raw = path.direct_url ?? fallbackDestination;
      break;
    case "lander":
      raw = path.lander_url;
      landerId = path.lander_id;
      break;
    case "offer":
      raw = path.offer_url;
      offerId = path.offer_id;
      break;
    case "lander_offer":
      raw = path.lander_url;
      landerId = path.lander_id;
      offerId = path.offer_id;
      break;
  }

  if (!raw) {
    return { error: "Path destination not configured" };
  }

  const substituted = substituteMacros(raw, { ...ctx, lander_id: landerId, offer_id: offerId });
  const parsed = parseHttpUrl(substituted);
  if (!parsed) {
    return { error: "Invalid path destination URL" };
  }

  let url = withQueryParam(parsed, "velo_ref", ctx.velo_ref);
  url = withQueryParam(url, "click_id", ctx.click_id);

  return {
    url,
    path_id: path.id,
    lander_id: landerId,
    offer_id: offerId,
  };
}

export function fallbackDestination(
  programDestination: string | null,
  ctx: RoutingContext,
): ResolvedDestination | { error: string } {
  if (!programDestination) {
    return { error: "Program destination not configured" };
  }
  const substituted = substituteMacros(programDestination, ctx);
  const parsed = parseHttpUrl(substituted);
  if (!parsed) {
    return { error: "Program destination not configured" };
  }
  let url = withQueryParam(parsed, "velo_ref", ctx.velo_ref);
  url = withQueryParam(url, "click_id", ctx.click_id);
  return { url, path_id: null, lander_id: null, offer_id: null };
}
