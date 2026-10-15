import type {
  FlowType,
  Path,
  PathWithEntities,
  Rotation,
  RotationConfig,
  RotationMode,
} from "../types-routing";
import { id } from "../lib/utils";

const PATH_COLUMNS =
  "id, rotation_id, name, flow_type, weight, sort_order, direct_url, lander_id, offer_id, enabled, created_at";

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
  const select = () =>
    db
      .prepare("SELECT id, program_id, mode, fixed_path_id, created_at FROM rotations WHERE program_id = ?")
      .bind(programId)
      .first<Rotation>();

  let rotation = await select();
  if (!rotation) {
    // Concurrent first clicks: the loser of the insert race reads the winner's row.
    await db
      .prepare(
        `INSERT INTO rotations (id, program_id, mode, fixed_path_id, created_at)
         VALUES (?, ?, 'normal', NULL, ?) ON CONFLICT(program_id) DO NOTHING`,
      )
      .bind(id("rot"), programId, Date.now())
      .run();
    rotation = await select();
  }
  if (!rotation) throw new Error("Could not create rotation");
  return { ...rotation, fixed_path_id: rotation.fixed_path_id ?? null };
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

function mapPath(row: {
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
}): Path {
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
  };
}

type PathRow = ReturnType<typeof mapPath> extends Path ? Parameters<typeof mapPath>[0] : never;

export async function listPaths(db: D1Database, rotationId: string): Promise<PathWithEntities[]> {
  const { results } = await db
    .prepare(
      `SELECT
        p.id, p.rotation_id, p.name, p.flow_type, p.weight, p.sort_order,
        p.direct_url, p.lander_id, p.offer_id, p.enabled, p.created_at,
        l.url AS lander_url, l.name AS lander_name,
        o.url AS offer_url, o.name AS offer_name
       FROM paths p
       LEFT JOIN landers l ON l.id = p.lander_id
       LEFT JOIN offers o ON o.id = p.offer_id
       WHERE p.rotation_id = ?
       ORDER BY p.sort_order ASC, p.created_at ASC`,
    )
    .bind(rotationId)
    .all<
      PathRow & {
        lander_url: string | null;
        lander_name: string | null;
        offer_url: string | null;
        offer_name: string | null;
      }
    >();

  return (results ?? []).map((row) => ({
    ...mapPath(row),
    lander_url: row.lander_url ?? null,
    lander_name: row.lander_name ?? null,
    offer_url: row.offer_url ?? null,
    offer_name: row.offer_name ?? null,
  }));
}

export async function getRotationConfig(
  db: D1Database,
  programId: string,
): Promise<RotationConfig> {
  const rotation = await getOrCreateRotation(db, programId);
  const paths = await listPaths(db, rotation.id);
  return { rotation, paths };
}

export async function getPathById(
  db: D1Database,
  pathId: string,
  programId: string,
): Promise<PathWithEntities | null> {
  const row = await db
    .prepare(
      `SELECT
        p.id, p.rotation_id, p.name, p.flow_type, p.weight, p.sort_order,
        p.direct_url, p.lander_id, p.offer_id, p.enabled, p.created_at,
        l.url AS lander_url, l.name AS lander_name,
        o.url AS offer_url, o.name AS offer_name,
        r.program_id
       FROM paths p
       JOIN rotations r ON r.id = p.rotation_id
       LEFT JOIN landers l ON l.id = p.lander_id
       LEFT JOIN offers o ON o.id = p.offer_id
       WHERE p.id = ? AND r.program_id = ?`,
    )
    .bind(pathId, programId)
    .first<
      PathRow & {
        lander_url: string | null;
        lander_name: string | null;
        offer_url: string | null;
        offer_name: string | null;
        program_id: string;
      }
    >();

  if (!row) return null;

  return {
    ...mapPath(row),
    lander_url: row.lander_url ?? null,
    lander_name: row.lander_name ?? null,
    offer_url: row.offer_url ?? null,
    offer_name: row.offer_name ?? null,
  };
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
  },
): Promise<PathWithEntities> {
  const rotation = await getOrCreateRotation(db, programId);
  const path: Path = {
    id: id("pth"),
    rotation_id: rotation.id,
    name: input.name,
    flow_type: input.flow_type,
    weight: input.weight ?? 100,
    sort_order: input.sort_order ?? 0,
    direct_url: input.direct_url ?? null,
    lander_id: input.lander_id ?? null,
    offer_id: input.offer_id ?? null,
    enabled: input.enabled ?? true,
    created_at: Date.now(),
  };

  await db
    .prepare(
      `INSERT INTO paths (
        id, rotation_id, name, flow_type, weight, sort_order,
        direct_url, lander_id, offer_id, enabled, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    )
    .run();

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
  }>,
): Promise<PathWithEntities | null> {
  const existing = await getPathById(db, pathId, programId);
  if (!existing) return null;

  const next = {
    name: updates.name?.trim() || existing.name,
    flow_type: updates.flow_type ?? existing.flow_type,
    weight: updates.weight ?? existing.weight,
    sort_order: updates.sort_order ?? existing.sort_order,
    direct_url: updates.direct_url === undefined ? existing.direct_url : updates.direct_url,
    lander_id: updates.lander_id === undefined ? existing.lander_id : updates.lander_id,
    offer_id: updates.offer_id === undefined ? existing.offer_id : updates.offer_id,
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

  return getPathById(db, pathId, programId);
}

export async function deletePath(
  db: D1Database,
  pathId: string,
  programId: string,
): Promise<boolean> {
  const existing = await getPathById(db, pathId, programId);
  if (!existing) return false;
  const result = await db.prepare("DELETE FROM paths WHERE id = ?").bind(pathId).run();
  return (result.meta.changes ?? 0) > 0;
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
  const select = () =>
    db
      .prepare("SELECT id, code FROM affiliates WHERE program_id = ? AND code = ?")
      .bind(programId, code)
      .first<{ id: string; code: string }>();

  const existing = await select();
  if (existing) return existing;

  // Concurrent first clicks: the loser of the insert race reads the winner's row.
  await db
    .prepare(
      `INSERT INTO affiliates (id, program_id, name, code, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(code) DO NOTHING`,
    )
    .bind(id("aff"), programId, "Campaign traffic", code, Date.now())
    .run();
  const created = await select();
  if (!created) throw new Error("Could not create campaign affiliate");
  return created;
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
