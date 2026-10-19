import { useEffect, useMemo, useState } from "react";
import {
  api,
  formatMoney,
  formatPercent,
  otherCurrencies,
  type CampaignReportRow,
  type EventMetrics,
  type Group,
  type GroupedReportRow,
  type TrafficSource,
  type TrendPoint,
} from "../lib/api";
import { ErrorBox, Field } from "./ui";
import { DrilldownPanel } from "./Drilldown";
import { eventLabel, sortEvents } from "../lib/events";
import { useSubLabels, withSubLabels } from "../lib/sources-api";
import { REPORT_DIMENSIONS, groupOptions } from "../lib/report-dimensions";

/** Event names present in rows, one report column each. */
function eventColumns(rows: Array<{ events: Record<string, number> }>): string[] {
  return sortEvents([...new Set(rows.flatMap((row) => Object.keys(row.events)))]);
}

/** Event count with its CR and cost per event. */
function EventCell({ metrics, currency }: { metrics?: EventMetrics; currency: string }) {
  if (!metrics) return <td>0</td>;
  return (
    <td>
      {metrics.count}
      <div className="text-xs text-[var(--velo-muted)]">
        {formatPercent(metrics.cr)}
        {metrics.cpa_cents != null && ` · ${formatMoney(metrics.cpa_cents, currency)}`}
      </div>
    </td>
  );
}

/** Revenue in the report currency, plus other currencies (never summed together). */
function RevenueCell({
  row,
}: {
  row: { metrics: { revenue_cents: number }; currency: string; revenue_by_currency: Record<string, number> };
}) {
  const others = otherCurrencies(row.revenue_by_currency, row.currency);
  return (
    <td>
      {formatMoney(row.metrics.revenue_cents, row.currency)}
      {others && <div className="text-xs text-[var(--velo-muted)]">{others}</div>}
    </td>
  );
}

type DatePreset =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "this_month"
  | "last_month"
  | "all"
  | "custom";

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

/** Inside one campaign, grouping by campaign is meaningless. */
const GROUP_BY_OPTIONS = REPORT_DIMENSIONS.filter((d) => d.value !== "campaign");

const DAY_MS = 24 * 60 * 60 * 1000;

/** Date presets use the browser's local calendar days, like the custom range. */
function presetRange(
  preset: DatePreset,
  custom: { from: string; to: string },
  now = new Date(),
): { from?: number; to?: number } {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  switch (preset) {
    case "all":
      return {};
    case "custom":
      return {
        from: custom.from ? new Date(`${custom.from}T00:00:00`).getTime() : undefined,
        to: custom.to ? new Date(`${custom.to}T23:59:59.999`).getTime() : undefined,
      };
    case "today":
      return { from: today, to: now.getTime() };
    case "yesterday": {
      const yesterday = startOfDay(new Date(today - 1));
      return { from: yesterday, to: today - 1 };
    }
    case "this_month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: now.getTime() };
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      return { from: start, to: new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1 };
    }
    default: {
      const days = preset === "7d" ? 7 : 30;
      return { from: now.getTime() - days * DAY_MS, to: now.getTime() };
    }
  }
}

function queryString(filters: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value != null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function CampaignReportPanel({ canWrite = true }: { canWrite?: boolean }) {
  const [campaigns, setCampaigns] = useState<CampaignReportRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sources, setSources] = useState<TrafficSource[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [groupId, setGroupId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const subLabels = useSubLabels(selectedId);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [groupBy, setGroupBy] = useState("country");
  const [groupedRows, setGroupedRows] = useState<GroupedReportRow[]>([]);
  const campaignEvents = useMemo(() => eventColumns(campaigns), [campaigns]);

  const filters = useMemo(() => {
    const range = presetRange(preset, { from: customFrom, to: customTo });
    return {
      from: range.from,
      to: range.to,
      group_id: groupId || undefined,
      traffic_source_id: sourceId || undefined,
      status: status || undefined,
    };
  }, [preset, customFrom, customTo, groupId, sourceId, status]);

  useEffect(() => {
    api.groups().then(({ groups: items }) => setGroups(items)).catch(() => {});
    api.trafficSources().then(({ traffic_sources }) => setSources(traffic_sources)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    api
      .campaignReports(filters)
      .then(({ campaigns: rows }) => {
        if (!cancelled) {
          setCampaigns(rows);
          if (!selectedId && rows[0]) setSelectedId(rows[0].id);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load report");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => {
    if (!selectedId) {
      setTrends([]);
      return;
    }
    let cancelled = false;
    api
      .campaignTrends(selectedId, { from: filters.from, to: filters.to })
      .then(({ trends: points }) => {
        if (!cancelled) setTrends(points);
      })
      .catch(() => {
        if (!cancelled) setTrends([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, filters.from, filters.to]);

  useEffect(() => {
    if (!selectedId) {
      setGroupedRows([]);
      return;
    }
    let cancelled = false;
    api
      .groupedReport(groupBy, { campaign_id: selectedId, from: filters.from, to: filters.to })
      .then(({ rows }) => {
        if (!cancelled) setGroupedRows(rows);
      })
      .catch(() => {
        if (!cancelled) setGroupedRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, groupBy, filters.from, filters.to]);

  const selectedName = campaigns.find((row) => row.id === selectedId)?.name ?? "selected campaign";
  const exportCampaignsUrl = `/api/reports/campaigns.csv${queryString(filters)}`;

  async function bulkSetStatus(next: "active" | "paused") {
    if (checked.size === 0) return;
    setBusy(true);
    setError("");
    try {
      await api.bulkUpdatePrograms([...checked], { status: next });
      const { campaigns: rows } = await api.campaignReports(filters);
      setCampaigns(rows);
      setChecked(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold">Campaign report</h2>
            <p className="mt-1 text-sm text-[var(--velo-muted)]">
              Metrics across all campaigns.
            </p>
          </div>
          <a className="btn btn-secondary text-sm" href={exportCampaignsUrl}>
            Export CSV
          </a>
          {canWrite && checked.size > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-secondary text-sm"
                disabled={busy}
                onClick={() => bulkSetStatus("paused")}
                type="button"
              >
                Pause selected ({checked.size})
              </button>
              <button
                className="btn btn-secondary text-sm"
                disabled={busy}
                onClick={() => bulkSetStatus("active")}
                type="button"
              >
                Activate selected ({checked.size})
              </button>
            </div>
          )}
        </div>

        <ErrorBox message={error} />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="Date range"
            value={preset}
            onChange={(v) => setPreset(v as DatePreset)}
            options={DATE_PRESETS}
          />
          {preset === "custom" && (
            <>
              <Field
                label="From"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <Field
                label="To"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </>
          )}
          <FilterSelect
            label="Group"
            value={groupId}
            onChange={setGroupId}
            options={[{ value: "", label: "All groups" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
          />
          <FilterSelect
            label="Traffic source"
            value={sourceId}
            onChange={setSourceId}
            options={[
              { value: "", label: "All sources" },
              ...sources.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "All (active + paused)" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "archived", label: "Archived (deleted)" },
            ]}
          />
        </div>
      </div>

      <div className="card overflow-hidden p-5">
        {busy && campaigns.length === 0 ? (
          <p className="text-[var(--velo-muted)]">Loading report…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  {canWrite && <th />}
                  <th>Campaign</th>
                  <th>Clicks</th>
                  <th>LP CTR</th>
                  <th>CR</th>
                  <th>LP Clicks</th>
                  <th>Conversions</th>
                  {campaignEvents.map((name) => (
                    <th key={name}>{eventLabel(name)}</th>
                  ))}
                  <th>EPC</th>
                  <th>CPC</th>
                  <th>Revenue</th>
                  <th>Cost</th>
                  <th>Profit</th>
                  <th>ROI</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 && (
                  <tr>
                    <td colSpan={(canWrite ? 13 : 12) + campaignEvents.length} className="text-[var(--velo-muted)]">
                      No campaigns match these filters.
                    </td>
                  </tr>
                )}
                {campaigns.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedId === row.id ? "bg-[var(--velo-accent-soft)]" : undefined}
                    onClick={() => setSelectedId(row.id)}
                    style={{ cursor: "pointer" }}
                  >
                    {canWrite && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          checked={checked.has(row.id)}
                          onChange={() => toggleCheck(row.id)}
                          type="checkbox"
                        />
                      </td>
                    )}
                    <td>
                      <button className="text-left" type="button">
                        <div className="font-medium">
                          {row.name}
                          {row.status !== "active" && (
                            <span className="ml-2 text-xs font-normal text-[var(--velo-muted)]">
                              {row.status}
                            </span>
                          )}
                        </div>
                        <div className="mono text-xs text-[var(--velo-muted)]">
                          {row.campaign_key ?? row.slug}
                        </div>
                      </button>
                    </td>
                    <td>{row.metrics.clicks}</td>
                    <td>{formatPercent(row.metrics.lp_ctr)}</td>
                    <td>{formatPercent(row.metrics.cr)}</td>
                    <td>{row.metrics.lp_clicks}</td>
                    <td>{row.metrics.leads}</td>
                    {campaignEvents.map((name) => (
                      <EventCell currency={row.currency} key={name} metrics={row.event_metrics[name]} />
                    ))}
                    <td>{formatMoney(row.metrics.epc_cents, row.currency)}</td>
                    <td>{formatMoney(row.metrics.cpc_cents, row.currency)}</td>
                    <RevenueCell row={row} />
                    <td>{formatMoney(row.metrics.cost_cents, row.currency)}</td>
                    <td>{formatMoney(row.metrics.profit_cents, row.currency)}</td>
                    <td>{formatPercent(row.metrics.roi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Trends — {selectedName}</h3>
            <div className="flex gap-2">
              <a
                className="btn btn-secondary text-sm"
                href={`/api/reports/clicks.csv${queryString({ program_id: selectedId, from: filters.from, to: filters.to })}`}
              >
                Export clicklog
              </a>
              <a
                className="btn btn-secondary text-sm"
                href={`/api/reports/conversions.csv${queryString({ program_id: selectedId, from: filters.from, to: filters.to })}`}
              >
                Export conversions
              </a>
            </div>
          </div>
          <TrendChart points={trends} />
        </div>
      )}

      {selectedId && (
        <div className="card p-5">
          <h3 className="font-semibold">Breakdown — {selectedName}</h3>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div className="w-56">
              <FilterSelect label="Group by" value={groupBy} onChange={setGroupBy} options={withSubLabels(GROUP_BY_OPTIONS, subLabels)} />
            </div>
            <a
              className="btn btn-secondary text-sm"
              href={`/api/reports/grouped.csv${queryString({ by: groupBy, campaign_id: selectedId, from: filters.from, to: filters.to })}`}
            >
              Export CSV
            </a>
          </div>
          <GroupedTable rows={groupedRows} />
        </div>
      )}

      <DrilldownPanel campaignId={selectedId || undefined} from={filters.from} to={filters.to} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; group?: string }>;
}) {
  const sections = groupOptions(options);
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[var(--velo-muted)]">{label}</span>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {sections.map(([group, items]) => {
          const rendered = items.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ));
          return group ? (
            <optgroup key={group} label={group}>
              {rendered}
            </optgroup>
          ) : (
            rendered
          );
        })}
      </select>
    </label>
  );
}

function GroupedTable({ rows }: { rows: GroupedReportRow[] }) {
  const events = eventColumns(rows);
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Group</th>
            <th>Clicks</th>
            <th>Unique</th>
            <th>Bots</th>
            <th>LP Clicks</th>
            <th>Conversions</th>
            {events.map((name) => (
              <th key={name}>{eventLabel(name)}</th>
            ))}
            <th>CR</th>
            <th>EPC</th>
            <th>Revenue</th>
            <th>Cost</th>
            <th>Profit</th>
            <th>ROI</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={12 + events.length} className="text-[var(--velo-muted)]">
                No data for this period.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.key ?? "__none"}>
              <td className="font-medium">{row.label}</td>
              <td>{row.metrics.clicks}</td>
              <td>{row.unique_clicks}</td>
              <td>{row.bot_clicks}</td>
              <td>{row.metrics.lp_clicks}</td>
              <td>{row.metrics.leads}</td>
              {events.map((name) => (
                <EventCell currency={row.currency} key={name} metrics={row.event_metrics[name]} />
              ))}
              <td>{formatPercent(row.metrics.cr)}</td>
              <td>{formatMoney(row.metrics.epc_cents, row.currency)}</td>
              <RevenueCell row={row} />
              <td>{formatMoney(row.metrics.cost_cents, row.currency)}</td>
              <td>{formatMoney(row.metrics.profit_cents, row.currency)}</td>
              <td>{formatPercent(row.metrics.roi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return <p className="mt-4 text-sm text-[var(--velo-muted)]">No trend data for this period.</p>;
  }

  const maxClicks = Math.max(...points.map((p) => p.clicks), 1);
  const maxRevenue = Math.max(...points.map((p) => p.revenue_cents), 1);

  return (
    <div className="mt-4 space-y-6">
      <div>
        <div className="mb-2 text-sm font-medium">Clicks & conversions</div>
        <div className="flex h-40 items-end gap-1 border-b border-[var(--velo-border)] pb-2">
          {points.map((point) => (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1" key={point.date}>
              <div className="flex h-32 w-full items-end justify-center gap-0.5">
                <div
                  className="w-2 rounded-t bg-[var(--velo-accent)]"
                  style={{ height: `${(point.clicks / maxClicks) * 100}%` }}
                  title={`${point.clicks} clicks`}
                />
                <div
                  className="w-2 rounded-t bg-[var(--velo-muted)] opacity-40"
                  style={{ height: `${(point.leads / maxClicks) * 100}%` }}
                  title={`${point.leads} conversions`}
                />
              </div>
              <span className="truncate text-[10px] text-[var(--velo-muted)]">
                {point.date.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-sm font-medium">Revenue</div>
        <div className="flex h-24 items-end gap-1 border-b border-[var(--velo-border)] pb-2">
          {points.map((point) => (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1" key={`rev-${point.date}`}>
              <div className="flex h-16 w-full items-end justify-center">
                <div
                  className="w-full max-w-4 rounded-t bg-[var(--velo-ink)]"
                  style={{ height: `${(point.revenue_cents / maxRevenue) * 100}%` }}
                  title={formatMoney(point.revenue_cents)}
                />
              </div>
              <span className="truncate text-[10px] text-[var(--velo-muted)]">
                {point.date.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
