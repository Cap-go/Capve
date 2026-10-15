import {
  defaultTrafficFilter,
  type BlocklistEntry,
  type BlocklistKind,
  type BotAction,
  type TrafficFilter,
} from "../lib/antifraud";
import { id } from "../lib/utils";

type FilterRow = {
  program_id: string;
  bot_action: BotAction;
  safe_page_url: string | null;
  block_datacenter: number;
};

function mapFilter(row: FilterRow): TrafficFilter {
  return {
    program_id: row.program_id,
    bot_action: row.bot_action,
    safe_page_url: row.safe_page_url,
    block_datacenter: Boolean(row.block_datacenter),
  };
}

export async function getTrafficFilter(db: D1Database, programId: string): Promise<TrafficFilter> {
  const row = await db
    .prepare(
      "SELECT program_id, bot_action, safe_page_url, block_datacenter FROM campaign_traffic_filters WHERE program_id = ?",
    )
    .bind(programId)
    .first<FilterRow>();
  return row ? mapFilter(row) : defaultTrafficFilter(programId);
}

export async function saveTrafficFilter(db: D1Database, filter: TrafficFilter): Promise<TrafficFilter> {
  await db
    .prepare(
      `INSERT INTO campaign_traffic_filters (program_id, bot_action, safe_page_url, block_datacenter, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(program_id) DO UPDATE SET
         bot_action = excluded.bot_action,
         safe_page_url = excluded.safe_page_url,
         block_datacenter = excluded.block_datacenter,
         updated_at = excluded.updated_at`,
    )
    .bind(
      filter.program_id,
      filter.bot_action,
      filter.safe_page_url,
      filter.block_datacenter ? 1 : 0,
      Date.now(),
    )
    .run();
  return filter;
}

/** Campaign filter + the owning account's blocklist in one round trip (redirect hot path). */
export async function loadClickFilters(
  db: D1Database,
  programId: string,
): Promise<{ filter: TrafficFilter; blocklist: Pick<BlocklistEntry, "kind" | "value">[] }> {
  const [filterRes, blockRes] = await db.batch([
    db
      .prepare(
        "SELECT program_id, bot_action, safe_page_url, block_datacenter FROM campaign_traffic_filters WHERE program_id = ?",
      )
      .bind(programId),
    db
      .prepare(
        "SELECT kind, value FROM blocklist_entries WHERE user_id = (SELECT user_id FROM programs WHERE id = ?)",
      )
      .bind(programId),
  ]);
  const filterRow = (filterRes?.results?.[0] as FilterRow | undefined) ?? null;
  return {
    filter: filterRow ? mapFilter(filterRow) : defaultTrafficFilter(programId),
    blocklist: (blockRes?.results ?? []) as Pick<BlocklistEntry, "kind" | "value">[],
  };
}

export async function listBlocklist(db: D1Database, accountId: string): Promise<BlocklistEntry[]> {
  const { results } = await db
    .prepare(
      "SELECT id, kind, value, created_at FROM blocklist_entries WHERE user_id = ? ORDER BY kind, created_at DESC",
    )
    .bind(accountId)
    .all<BlocklistEntry>();
  return results ?? [];
}

export async function addBlocklistEntries(
  db: D1Database,
  accountId: string,
  kind: BlocklistKind,
  values: string[],
): Promise<void> {
  if (values.length === 0) return;
  const now = Date.now();
  await db.batch(
    values.map((value) =>
      db
        .prepare(
          `INSERT INTO blocklist_entries (id, user_id, kind, value, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, kind, value) DO NOTHING`,
        )
        .bind(id("blk"), accountId, kind, value, now),
    ),
  );
}

export async function deleteBlocklistEntry(
  db: D1Database,
  accountId: string,
  entryId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM blocklist_entries WHERE id = ? AND user_id = ?")
    .bind(entryId, accountId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
