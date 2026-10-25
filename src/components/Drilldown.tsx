import { type ReactNode, useEffect, useMemo, useState } from "react";
import { formatMoney, formatPercent } from "../lib/api";
import { automationApi, type DrilldownNode } from "../lib/api-automation";
import { eventLabel, sortEvents } from "../lib/events";
import { ErrorBox } from "./ui";
import { REPORT_DIMENSIONS, dimensionLabel, groupOptions } from "../lib/report-dimensions";

const MAX_LEVELS = 4;

function collectEvents(rows: DrilldownNode[], into = new Set<string>()): Set<string> {
  for (const row of rows) {
    Object.keys(row.events).forEach((event) => into.add(event));
    collectEvents(row.children, into);
  }
  return into;
}

/** Multi-level report (campaign → sub1 → country → offer) with expandable rows. */
export function DrilldownPanel({
  campaignId,
  from,
  to,
}: {
  campaignId?: string;
  from?: number;
  to?: number;
}) {
  const [levels, setLevels] = useState<string[]>(
    campaignId ? ["sub1", "country"] : ["campaign", "sub1", "country"],
  );
  const [rows, setRows] = useState<DrilldownNode[]>([]);
  const [timezone, setTimezone] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const events = useMemo(() => sortEvents([...collectEvents(rows)]), [rows]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    automationApi
      .drilldown({ by: levels, campaign_id: campaignId, from, to })
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        setTimezone(data.timezone);
        setExpanded(new Set());
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load drilldown");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [levels.join(","), campaignId, from, to]);

  function setLevel(index: number, value: string) {
    setLevels((prev) => {
      const next = prev.slice(0, index);
      if (value) next.push(value, ...prev.slice(index + 1).filter((v) => v !== value));
      return next.length ? next : prev;
    });
  }

  function toggle(path: Array<string | null>) {
    const id = JSON.stringify(path);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderRows(nodes: DrilldownNode[], depth: number): ReactNode[] {
    return nodes.flatMap((node) => {
      const id = JSON.stringify(node.path);
      const open = expanded.has(id);
      const canExpand = node.children.length > 0;
      const row = (
        <tr key={id}>
          <td>
            <button
              className="flex items-center gap-2 text-left"
              disabled={!canExpand}
              onClick={() => toggle(node.path)}
              style={{ paddingLeft: depth * 20 }}
              type="button"
            >
              <span className="mono w-3 text-[var(--velo-muted)]">
                {canExpand ? (open ? "−" : "+") : ""}
              </span>
              <span className="font-medium">{node.label}</span>
            </button>
          </td>
          <td>{node.metrics.clicks}</td>
          <td>{node.metrics.leads}</td>
          {events.map((name) => (
            <td key={name}>{node.events[name] ?? 0}</td>
          ))}
          <td>{formatPercent(node.metrics.cr)}</td>
          <td>{formatMoney(node.metrics.revenue_cents)}</td>
          <td>{formatMoney(node.metrics.cost_cents)}</td>
          <td>{formatMoney(node.metrics.profit_cents)}</td>
          <td>{formatPercent(node.metrics.roi)}</td>
        </tr>
      );
      return open ? [row, ...renderRows(node.children, depth + 1)] : [row];
    });
  }


  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">Drilldown</h3>
          <p className="mt-1 text-sm text-[var(--velo-muted)]">
            Expand rows level by level{timezone ? ` · dates in ${timezone}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: Math.min(levels.length + 1, MAX_LEVELS) }, (_, index) => (
            <label className="block text-sm" key={index}>
              <span className="mb-1 block font-medium">Level {index + 1}</span>
              <select
                className="input"
                value={levels[index] ?? ""}
                onChange={(e) => setLevel(index, e.target.value)}
              >
                {index > 0 && <option value="">—</option>}
                {groupOptions(
                  REPORT_DIMENSIONS.filter((o) => o.value === levels[index] || !levels.includes(o.value)),
                ).map(([group, items]) => (
                  <optgroup key={group} label={group}>
                    {items.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
      <ErrorBox message={error} />
      <div className="mt-4 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{levels.map(dimensionLabel).join(" › ")}</th>
              <th>Clicks</th>
              <th>Conv.</th>
              {events.map((name) => (
                <th key={name}>{eventLabel(name)}</th>
              ))}
              <th>CR</th>
              <th>Revenue</th>
              <th>Cost</th>
              <th>Profit</th>
              <th>ROI</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="text-[var(--velo-muted)]" colSpan={8 + events.length}>
                  {loading ? "Loading…" : "No data for this period."}
                </td>
              </tr>
            )}
            {renderRows(rows, 0)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
