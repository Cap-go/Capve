import type {
  FlowType,
  Path,
  PathItem,
  PathWithEntities,
  Rotation,
  RotationConfig,
  RotationMode,
  RoutingRule,
  RoutingRuleWithPaths,
  RuleCondition,
} from "../types-routing";
import { id } from "../lib/utils";

/** Weighted lander/offer input for a path. `id` is the lander/offer id. */
export type PathItemInput = { id: string; weight: number };

export async function getProgramByCampaignKey(
  db: D1Database,
  campaignKey: string,
): Promise<{ id: string; user_id: string; campaign_key: string | null; destination_url: string | null; status: string } | null> {
  return db
    .prepare(
      "SELECT id, user_id, campaign_key, destination_url, status FROM programs WHERE campaign_key = ?",
    )
    .bind(campaignKey)
    .first();
}

export async function getOrCreateRotation(db: D1Database, programId: string): Promise<Rotation> {
  const existing = await db
    .prepare("SELECT id, program_id, mode, fixed_path_id, created_at FROM rotations WHERE program_id = ?")
    .bind(programId)
    .first<Rotation>();

  if (existing) {
    return { ...existing, fixed_path_id: existing.fixed_path_id ?? null };
  }

  const rotation: Rotation = {
    id: id("rot"),
    program_id: programId,
    mode: "normal",
    fixed_path_id: null,
    created_at: Date.now(),
  };
  await db
    .prepare(
      "INSERT INTO rotations (id, program_id, mode, fixed_path_id, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(rotation.id, rotation.program_id, rotation.mode, null, rotation.created_at)
    .run();
  return rotation;
}

export async function updateRotation(
  db: D1Database,
  programId: string,
  updates: { mode?: RotationMode; fixed_path_id?: string | null },
): Promise<Rotation | null> {
  const rotation = await getOrCreateRotation(db, programId);
  const next = {
    mode: updates.mode ?? rotation.mode,
    fixed_path_id:
      updates.fixed_path_id === undefined ? rotation.fixed_path_id : updates.fixed_path_id,
  };

  await db
    .prepare("UPDATE rotations SET mode = ?, fixed_path_id = ? WHERE id = ?")
    .bind(next.mode, next.fixed_path_id, rotation.id)
    .run();

  return { ...rotation, ...next };
}

type PathRow = {
  id: string;
  rotation_id: string;
  name: string;
  flow_type: FlowType;
  weight: number;
  sort_order: number;
  direct_url: string | null;
  lander_id: string | null;
  offer_id: string | null;
  enabled: number;
  created_at: number;
  rule_id?: string | null;
};

function mapPath(row: PathRow): Path {
  return {
    id: row.id,
    rotation_id: row.rotation_id,
    name: row.name,
    flow_type: row.flow_type,
    weight: row.weight,
    sort_order: row.sort_order,
    direct_url: row.direct_url,
    lander_id: row.lander_id,
    offer_id: row.offer_id,
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
    rule_id: row.rule_id ?? null,
  };
}

const PATH_SELECT = `SELECT
        p.id, p.rotation_id, p.name, p.flow_type, p.weight, p.sort_order,
        p.direct_url, p.lander_id, p.offer_id, p.enabled, p.created_at, p.rule_id,
        l.url AS lander_url, l.name AS lander_name,
        o.url AS offer_url, o.name AS offer_name
       FROM paths p
       LEFT JOIN landers l ON l.id = p.lander_id
       LEFT JOIN offers o ON o.id = p.offer_id`;

type PathJoinRow = PathRow & {
  lander_url: string | null;
  lander_name: string | null;
  offer_url: string | null;
  offer_name: string | null;
};

type ItemRow = { path_id: string; id: string; weight: number; url: string; name: string };

function pathLandersQuery(db: D1Database, where: string, bind: string) {
  return db
    .prepare(
      `SELECT pl.path_id, pl.lander_id AS id, pl.weight, l.url, l.name
       FROM path_landers pl
       JOIN paths p ON p.id = pl.path_id
       JOIN landers l ON l.id = pl.lander_id
       WHERE ${where}
       ORDER BY pl.created_at ASC, pl.id ASC`,
    )
    .bind(bind);
}

function pathOffersQuery(db: D1Database, where: string, bind: string) {
  return db
    .prepare(
      `SELECT po.path_id, po.offer_id AS id, po.weight, o.url, o.name
       FROM path_offers po
       JOIN paths p ON p.id = po.path_id
       JOIN offers o ON o.id = po.offer_id
       WHERE ${where}
       ORDER BY po.created_at ASC, po.id ASC`,
    )
    .bind(bind);
}

function groupItems(rows: ItemRow[]): Map<string, PathItem[]> {
  const map = new Map<string, PathItem[]>();
  for (const row of rows) {
    const list = map.get(row.path_id) ?? [];
    list.push({ id: row.id, weight: row.weight, url: row.url, name: row.name });
    map.set(row.path_id, list);
  }
  return map;
}

function toPathWithEntities(
  row: PathJoinRow,
  landers: Map<string, PathItem[]>,
  offers: Map<string, PathItem[]>,
): PathWithEntities {
  return {
    ...mapPath(row),
    lander_url: row.lander_url ?? null,
    lander_name: row.lander_name ?? null,
    offer_url: row.offer_url ?? null,
    offer_name: row.offer_name ?? null,
    landers: landers.get(row.id) ?? [],
    offers: offers.get(row.id) ?? [],
  };
}

/** All paths of a rotation (default pool and rule paths) with their weighted landers/offers. */
export async function listPaths(db: D1Database, rotationId: string): Promise<PathWithEntities[]> {
  const [pathRes, landerRes, offerRes] = await db.batch([
    db
      .prepare(`${PATH_SELECT} WHERE p.rotation_id = ? ORDER BY p.sort_order ASC, p.created_at ASC`)
      .bind(rotationId),
    pathLandersQuery(db, "p.rotation_id = ?", rotationId),
    pathOffersQuery(db, "p.rotation_id = ?", rotationId),
  ]);
  const landers = groupItems((landerRes?.results ?? []) as ItemRow[]);
  const offers = groupItems((offerRes?.results ?? []) as ItemRow[]);
  return ((pathRes?.results ?? []) as PathJoinRow[]).map((row) =>
    toPathWithEntities(row, landers, offers),
  );
}

type RuleRow = {
  id: string;
  program_id: string;
  name: string;
  sort_order: number;
  conditions: string;
  timezone: string;
  enabled: number;
  created_at: number;
};

const RULE_COLUMNS = "id, program_id, name, sort_order, conditions, timezone, enabled, created_at";

function mapRule(row: RuleRow): RoutingRule {
  let conditions: RuleCondition[] = [];
  try {
    const parsed = JSON.parse(row.conditions) as unknown;
    if (Array.isArray(parsed)) conditions = parsed as RuleCondition[];
  } catch {
    conditions = [];
  }
  return {
    id: row.id,
    program_id: row.program_id,
    name: row.name,
    sort_order: row.sort_order,
    conditions,
    timezone: row.timezone,
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
  };
}

export async function listRules(db: D1Database, programId: string): Promise<RoutingRule[]> {
  const { results } = await db
    .prepare(
      `SELECT ${RULE_COLUMNS} FROM routing_rules WHERE program_id = ? ORDER BY sort_order ASC, created_at ASC`,
    )
    .bind(programId)
    .all<RuleRow>();
  return (results ?? []).map(mapRule);
}

export async function getRotationConfig(
  db: D1Database,
  programId: string,
): Promise<RotationConfig> {
  const rotation = await getOrCreateRotation(db, programId);
  const [all, rules] = await Promise.all([listPaths(db, rotation.id), listRules(db, programId)]);
  const paths: PathWithEntities[] = [];
  const byRule = new Map<string, PathWithEntities[]>();
  for (const path of all) {
    if (!path.rule_id) {
      paths.push(path);
      continue;
    }
    const list = byRule.get(path.rule_id) ?? [];
    list.push(path);
    byRule.set(path.rule_id, list);
  }
  const withPaths: RoutingRuleWithPaths[] = rules.map((rule) => ({
    ...rule,
    paths: byRule.get(rule.id) ?? [],
  }));
  return { rotation, paths, rules: withPaths };
}

export async function getRule(
  db: D1Database,
  ruleId: string,
  programId: string,
): Promise<RoutingRule | null> {
  const row = await db
    .prepare(`SELECT ${RULE_COLUMNS} FROM routing_rules WHERE id = ? AND program_id = ?`)
    .bind(ruleId, programId)
    .first<RuleRow>();
  return row ? mapRule(row) : null;
}

export async function createRule(
  db: D1Database,
  programId: string,
  input: {
    name: string;
    conditions: RuleCondition[];
    timezone?: string;
    sort_order?: number;
    enabled?: boolean;
  },
): Promise<RoutingRule> {
  let sortOrder = input.sort_order;
  if (sortOrder === undefined) {
    const row = await db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM routing_rules WHERE program_id = ?",
      )
      .bind(programId)
      .first<{ next: number }>();
    sortOrder = row?.next ?? 0;
  }
  const rule: RoutingRule = {
    id: id("rul"),
    program_id: programId,
    name: input.name,
    sort_order: sortOrder,
    conditions: input.conditions,
    timezone: input.timezone ?? "UTC",
    enabled: input.enabled ?? true,
    created_at: Date.now(),
  };
  await db
    .prepare(`INSERT INTO routing_rules (${RULE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      rule.id,
      rule.program_id,
      rule.name,
      rule.sort_order,
      JSON.stringify(rule.conditions),
      rule.timezone,
      rule.enabled ? 1 : 0,
      rule.created_at,
    )
    .run();
  return rule;
}

export async function updateRule(
  db: D1Database,
  ruleId: string,
  programId: string,
  updates: Partial<{
    name: string;
    conditions: RuleCondition[];
    timezone: string;
    sort_order: number;
    enabled: boolean;
  }>,
): Promise<RoutingRule | null> {
  const existing = await getRule(db, ruleId, programId);
  if (!existing) return null;
  const next: RoutingRule = {
    ...existing,
    name: updates.name?.trim() || existing.name,
    conditions: updates.conditions ?? existing.conditions,
    timezone: updates.timezone ?? existing.timezone,
    sort_order: updates.sort_order ?? existing.sort_order,
    enabled: updates.enabled ?? existing.enabled,
  };
  await db
    .prepare(
      "UPDATE routing_rules SET name = ?, conditions = ?, timezone = ?, sort_order = ?, enabled = ? WHERE id = ?",
    )
    .bind(
      next.name,
      JSON.stringify(next.conditions),
      next.timezone,
      next.sort_order,
      next.enabled ? 1 : 0,
      ruleId,
    )
    .run();
  return next;
}

/** Deletes a rule together with its paths. */
export async function deleteRule(
  db: D1Database,
  ruleId: string,
  programId: string,
): Promise<boolean> {
  const existing = await getRule(db, ruleId, programId);
  if (!existing) return false;
  const rulePaths = "SELECT id FROM paths WHERE rule_id = ?";
  await db.batch([
    db.prepare(`DELETE FROM path_landers WHERE path_id IN (${rulePaths})`).bind(ruleId),
    db.prepare(`DELETE FROM path_offers WHERE path_id IN (${rulePaths})`).bind(ruleId),
    db.prepare(`DELETE FROM visitor_assignments WHERE path_id IN (${rulePaths})`).bind(ruleId),
    db
      .prepare(`UPDATE rotations SET fixed_path_id = NULL WHERE fixed_path_id IN (${rulePaths})`)
      .bind(ruleId),
    db.prepare("DELETE FROM paths WHERE rule_id = ?").bind(ruleId),
    db.prepare("DELETE FROM routing_rules WHERE id = ?").bind(ruleId),
  ]);
  return true;
}

/** Replaces a path's weighted landers or offers. */
export async function setPathItems(
  db: D1Database,
  pathId: string,
  kind: "lander" | "offer",
  items: PathItemInput[],
): Promise<void> {
  const table = kind === "lander" ? "path_landers" : "path_offers";
  const column = kind === "lander" ? "lander_id" : "offer_id";
  const prefix = kind === "lander" ? "pli" : "poi";
  const now = Date.now();
  await db.batch([
    db.prepare(`DELETE FROM ${table} WHERE path_id = ?`).bind(pathId),
    ...items.map((item, index) =>
      db
        .prepare(
          `INSERT INTO ${table} (id, path_id, ${column}, weight, created_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(id(prefix), pathId, item.id, Math.max(1, Math.round(item.weight)), now + index),
    ),
  ]);
}

export async function getPathById(
  db: D1Database,
  pathId: string,
  programId: string,
): Promise<PathWithEntities | null> {
  const [pathRes, landerRes, offerRes] = await db.batch([
    db
      .prepare(
        `${PATH_SELECT} JOIN rotations r ON r.id = p.rotation_id WHERE p.id = ? AND r.program_id = ?`,
      )
      .bind(pathId, programId),
    pathLandersQuery(db, "p.id = ?", pathId),
    pathOffersQuery(db, "p.id = ?", pathId),
  ]);
  const row = (pathRes?.results?.[0] as PathJoinRow | undefined) ?? null;
  if (!row) return null;
  return toPathWithEntities(
    row,
    groupItems((landerRes?.results ?? []) as ItemRow[]),
    groupItems((offerRes?.results ?? []) as ItemRow[]),
  );
}

export async function createPath(
  db: D1Database,
  programId: string,
  input: {
    name: string;
    flow_type: FlowType;
    weight?: number;
    sort_order?: number;
    direct_url?: string | null;
    lander_id?: string | null;
    offer_id?: string | null;
    enabled?: boolean;
    rule_id?: string | null;
    landers?: PathItemInput[];
    offers?: PathItemInput[];
  },
): Promise<PathWithEntities> {
  const rotation = await getOrCreateRotation(db, programId);
  // A bare lander_id / offer_id (legacy API) becomes a single-item weighted list.
  const landers = input.landers ?? (input.lander_id ? [{ id: input.lander_id, weight: 100 }] : []);
  const offers = input.offers ?? (input.offer_id ? [{ id: input.offer_id, weight: 100 }] : []);
  const path: Path = {
    id: id("pth"),
    rotation_id: rotation.id,
    name: input.name,
    flow_type: input.flow_type,
    weight: input.weight ?? 100,
    sort_order: input.sort_order ?? 0,
    direct_url: input.direct_url ?? null,
    lander_id: landers[0]?.id ?? null,
    offer_id: offers[0]?.id ?? null,
    enabled: input.enabled ?? true,
    created_at: Date.now(),
    rule_id: input.rule_id ?? null,
  };

  await db
    .prepare(
      `INSERT INTO paths (
        id, rotation_id, name, flow_type, weight, sort_order,
        direct_url, lander_id, offer_id, enabled, created_at, rule_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      path.id,
      path.rotation_id,
      path.name,
      path.flow_type,
      path.weight,
      path.sort_order,
      path.direct_url,
      path.lander_id,
      path.offer_id,
      path.enabled ? 1 : 0,
      path.created_at,
      path.rule_id,
    )
    .run();
  if (landers.length > 0) await setPathItems(db, path.id, "lander", landers);
  if (offers.length > 0) await setPathItems(db, path.id, "offer", offers);

  const created = await getPathById(db, path.id, programId);
  if (!created) throw new Error("Failed to create path");
  return created;
}

export async function updatePath(
  db: D1Database,
  pathId: string,
  programId: string,
  updates: Partial<{
    name: string;
    flow_type: FlowType;
    weight: number;
    sort_order: number;
    direct_url: string | null;
    lander_id: string | null;
    offer_id: string | null;
    enabled: boolean;
    landers: PathItemInput[];
    offers: PathItemInput[];
  }>,
): Promise<PathWithEntities | null> {
  const existing = await getPathById(db, pathId, programId);
  if (!existing) return null;

  // `landers` / `offers` replace the weighted lists; a bare lander_id / offer_id
  // (legacy API) becomes a single-item list.
  const single = (value: string | null | undefined) =>
    value === undefined ? undefined : value ? [{ id: value, weight: 100 }] : [];
  const landers = updates.landers ?? single(updates.lander_id);
  const offers = updates.offers ?? single(updates.offer_id);

  const next = {
    name: updates.name?.trim() || existing.name,
    flow_type: updates.flow_type ?? existing.flow_type,
    weight: updates.weight ?? existing.weight,
    sort_order: updates.sort_order ?? existing.sort_order,
    direct_url: updates.direct_url === undefined ? existing.direct_url : updates.direct_url,
    lander_id: landers === undefined ? existing.lander_id : (landers[0]?.id ?? null),
    offer_id: offers === undefined ? existing.offer_id : (offers[0]?.id ?? null),
    enabled: updates.enabled === undefined ? existing.enabled : updates.enabled,
  };

  await db
    .prepare(
      `UPDATE paths SET name = ?, flow_type = ?, weight = ?, sort_order = ?,
       direct_url = ?, lander_id = ?, offer_id = ?, enabled = ?
       WHERE id = ?`,
    )
    .bind(
      next.name,
      next.flow_type,
      next.weight,
      next.sort_order,
      next.direct_url,
      next.lander_id,
      next.offer_id,
      next.enabled ? 1 : 0,
      pathId,
    )
    .run();
  if (landers !== undefined) await setPathItems(db, pathId, "lander", landers);
  if (offers !== undefined) await setPathItems(db, pathId, "offer", offers);

  return getPathById(db, pathId, programId);
}

export async function deletePath(
  db: D1Database,
  pathId: string,
  programId: string,
): Promise<boolean> {
  const existing = await getPathById(db, pathId, programId);
  if (!existing) return false;
  const [, , result] = await db.batch([
    db.prepare("DELETE FROM path_landers WHERE path_id = ?").bind(pathId),
    db.prepare("DELETE FROM path_offers WHERE path_id = ?").bind(pathId),
    db.prepare("DELETE FROM paths WHERE id = ?").bind(pathId),
  ]);
  return (result?.meta.changes ?? 0) > 0;
}

export async function getVisitorAssignment(
  db: D1Database,
  programId: string,
  visitorKey: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      "SELECT path_id FROM visitor_assignments WHERE program_id = ? AND visitor_key = ?",
    )
    .bind(programId, visitorKey)
    .first<{ path_id: string }>();
  return row?.path_id ?? null;
}

export async function setVisitorAssignment(
  db: D1Database,
  programId: string,
  visitorKey: string,
  pathId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO visitor_assignments (id, program_id, visitor_key, path_id, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(program_id, visitor_key) DO UPDATE SET path_id = excluded.path_id`,
    )
    .bind(id("vas"), programId, visitorKey, pathId, Date.now())
    .run();
}

export async function countProgramClicks(db: D1Database, programId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM clicks WHERE program_id = ?")
    .bind(programId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getOrCreateCampaignAffiliate(
  db: D1Database,
  programId: string,
  campaignKey: string,
): Promise<{ id: string; code: string }> {
  const code = `c_${campaignKey}`;
  const existing = await db
    .prepare("SELECT id, code FROM affiliates WHERE program_id = ? AND code = ?")
    .bind(programId, code)
    .first<{ id: string; code: string }>();
  if (existing) return existing;

  const affiliateId = id("aff");
  await db
    .prepare(
      "INSERT INTO affiliates (id, program_id, name, code, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(affiliateId, programId, "Campaign traffic", code, Date.now())
    .run();
  return { id: affiliateId, code };
}

export async function getLanderById(db: D1Database, landerId: string) {
  return db
    .prepare("SELECT id, url, name FROM landers WHERE id = ?")
    .bind(landerId)
    .first<{ id: string; url: string; name: string }>();
}

export async function getOfferById(db: D1Database, offerId: string) {
  return db
    .prepare("SELECT id, url, name FROM offers WHERE id = ?")
    .bind(offerId)
    .first<{ id: string; url: string; name: string }>();
}
