import {
  TIME_DIMENSIONS,
  getGroupedReport,
  type GroupDimension,
  type GroupedReportOptions,
  type GroupedReportRow,
} from "./reports";

export const MAX_DRILLDOWN_LEVELS = 4;

export type DrilldownNode = GroupedReportRow & {
  dimension: GroupDimension;
  /** Keys from the first level down to this node. */
  path: Array<string | null>;
  children: DrilldownNode[];
};

/** Parses a composite key/label (JSON array) produced by `then_by`. */
function parseTuple(value: string | null, size: number): Array<string | null> {
  if (size === 1) return [value];
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown[];
    return Array.from({ length: size }, (_, i) =>
      parsed[i] == null ? null : String(parsed[i]),
    );
  } catch {
    return Array.from({ length: size }, () => null);
  }
}

/**
 * Multi-level report (campaign → sub1 → country → offer). Each level is one grouped report
 * over the dimension prefix, so every node carries exactly the metrics a grouped report would
 * show for that combination. `limit` caps children per parent (sorted like grouped reports).
 */
export async function getDrilldownReport(
  db: D1Database,
  userId: string,
  dimensions: GroupDimension[],
  options: GroupedReportOptions,
  limit = 50,
): Promise<DrilldownNode[]> {
  const levels = await Promise.all(
    dimensions.map((_, depth) =>
      getGroupedReport(db, userId, dimensions[0], {
        ...options,
        then_by: dimensions.slice(1, depth + 1),
      }),
    ),
  );

  const roots: DrilldownNode[] = [];
  let parents = new Map<string, DrilldownNode[]>([["[]", roots]]);

  levels.forEach((rows, depth) => {
    const size = depth + 1;
    const next = new Map<string, DrilldownNode[]>();
    for (const row of rows) {
      const keys = parseTuple(row.key, size);
      const siblings = parents.get(JSON.stringify(keys.slice(0, depth)));
      if (!siblings || siblings.length >= limit) continue;
      const key = keys[depth];
      const label = size === 1 ? row.label : parseTuple(row.label, size)[depth];
      const node: DrilldownNode = {
        ...row,
        key,
        label: label ?? key ?? "(none)",
        dimension: dimensions[depth],
        path: keys,
        children: [],
      };
      siblings.push(node);
      next.set(JSON.stringify(keys), node.children);
    }
    parents = next;
  });

  sortTimeLevels(roots);
  return roots;
}

/** Time levels (hour, weekday…) read in order; other levels keep the by-clicks order. */
function sortTimeLevels(nodes: DrilldownNode[]): void {
  if (nodes.length && TIME_DIMENSIONS.has(nodes[0].dimension)) {
    nodes.sort((a, b) => (a.key ?? "").localeCompare(b.key ?? ""));
  }
  for (const node of nodes) sortTimeLevels(node.children);
}
