import { getProgram, listPrograms, updateProgram } from "../db/queries";
import { createPath, getOrCreateRotation, getRotationConfig } from "../db/routing";
import { withUniqueCampaignKey } from "./entities";
import { copyCampaignPostbacks } from "./postbacks";
import type { Program } from "../types";
import { apiKey, convertSecret, id, slugify } from "../lib/utils";

export async function bulkUpdatePrograms(
  db: D1Database,
  accountUserId: string,
  programIds: string[],
  updates: {
    status?: string;
    group_id?: string | null;
    traffic_source_id?: string | null;
    tags?: string | null;
  },
): Promise<number> {
  let changed = 0;
  for (const programId of programIds) {
    const program = await updateProgram(db, programId, accountUserId, updates);
    if (program) changed += 1;
  }
  return changed;
}

export async function cloneProgram(
  db: D1Database,
  accountUserId: string,
  programId: string,
  name?: string,
): Promise<Program | null> {
  const source = await getProgram(db, programId, accountUserId);
  if (!source) return null;

  const cloneName = name?.trim() || `${source.name} (copy)`;
  const secret = convertSecret();
  const base: Omit<Program, "campaign_key"> & { convert_secret: string } = {
    id: id("prg"),
    user_id: accountUserId,
    name: cloneName,
    slug: slugify(cloneName),
    api_key: apiKey(),
    destination_url: source.destination_url,
    convert_secret: secret,
    group_id: source.group_id,
    traffic_source_id: source.traffic_source_id,
    tags: source.tags,
    status: "paused",
    created_at: Date.now(),
  };

  const program = await withUniqueCampaignKey(cloneName, async (campaign_key) => {
    const candidate = { ...base, campaign_key };
    await insertClonedProgram(db, candidate);
    return candidate;
  });

  await copyCampaignPostbacks(db, source.id, program.id);

  const config = await getRotationConfig(db, source.id);
  if (config.paths.length > 0) {
    const pathIdMap = new Map<string, string>();
    for (const path of config.paths) {
      const created = await createPath(db, program.id, {
        name: path.name,
        flow_type: path.flow_type,
        weight: path.weight,
        sort_order: path.sort_order,
        direct_url: path.direct_url,
        lander_id: path.lander_id,
        offer_id: path.offer_id,
        enabled: path.enabled,
      });
      pathIdMap.set(path.id, created.id);
    }
    const fixedPathId = config.rotation.fixed_path_id
      ? (pathIdMap.get(config.rotation.fixed_path_id) ?? null)
      : null;
    await db
      .prepare("UPDATE rotations SET mode = ?, fixed_path_id = ? WHERE program_id = ?")
      .bind(config.rotation.mode, fixedPathId, program.id)
      .run();
  } else {
    await getOrCreateRotation(db, program.id);
  }

  const { convert_secret: _secret, ...publicProgram } = program;
  return publicProgram;
}

async function insertClonedProgram(
  db: D1Database,
  program: Program & { convert_secret: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO programs (
        id, user_id, name, slug, api_key, destination_url, convert_secret,
        campaign_key, group_id, traffic_source_id, tags, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      program.id,
      program.user_id,
      program.name,
      program.slug,
      program.api_key,
      program.destination_url,
      program.convert_secret,
      program.campaign_key,
      program.group_id,
      program.traffic_source_id,
      program.tags,
      program.status,
      program.created_at,
    )
    .run();
}

export async function listOwnedPrograms(db: D1Database, accountUserId: string) {
  return listPrograms(db, accountUserId);
}
