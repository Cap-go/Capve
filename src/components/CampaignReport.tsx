import { useEffect, useMemo, useState } from "react";
import {
  api,
  formatMoney,
  formatPercent,
  type CampaignReportRow,
  type Group,
  type TrafficSource,
  type TrendPoint,
} from "../lib/api";
import { ErrorBox } from "./ui";

type DatePreset = "7d" | "30d" | "all";

function presetRange(preset: DatePreset): { from?: number; to?: number } {
  if (preset === "all") return {};
  const days = preset === "7d" ? 7 : 30;
  const to = Date.now();
  const from = to - days * 24 * 60 * 60 * 1000;
  return { from, to };
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
  const [groupId, setGroupId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [trends, setTrends] = useState<TrendPoint[]>([]);

  const filters = useMemo(() => {
    const range = presetRange(preset);
    return {
      from: range.from,
      to: range.to,
      group_id: groupId || undefined,
      traffic_source_id: sourceId || undefined,
      status: status || undefined,
    };
  }, [preset, groupId, sourceId, status]);

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

  const exportCampaignsUrl = `/api/reports/campaigns.csv${queryString(filters)}`;

  async function bulkPause() {
    if (checked.size === 0) return;
    setBusy(true);
    try {
      await api.bulkUpdatePrograms([...checked], { status: "paused" });
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
              Binom-style metrics across all campaigns.
            </p>
          </div>
          <a className="btn btn-secondary text-sm" href={exportCampaignsUrl}>
            Export CSV
          </a>
          {canWrite && checked.size > 0 && (
            <button className="btn btn-secondary text-sm" disabled={busy} onClick={bulkPause} type="button">
              Pause selected ({checked.size})
            </button>
          )}
        </div>

        <ErrorBox message={error} />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="Date range"
            value={preset}
            onChange={(v) => setPreset(v as DatePreset)}
            options={[
              { value: "7d", label: "Last 7 days" },
              { value: "30d", label: "Last 30 days" },
              { value: "all", label: "All time" },
            ]}
          />
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
              { value: "", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
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
                  <th>Leads</th>
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
                    <td colSpan={canWrite ? 13 : 12} className="text-[var(--velo-muted)]">
                      No campaigns match these filters.
                    </td>
                  </tr>
                )}
                {campaigns.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedId === row.id ? "bg-[var(--velo-accent-soft)]" : undefined}
                    onClick={() => setSelectedId(row.id)}
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
                        <div className="font-medium">{row.name}</div>
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
                    <td>{formatMoney(row.metrics.epc_cents)}</td>
                    <td>{formatMoney(row.metrics.cpc_cents)}</td>
                    <td>{formatMoney(row.metrics.revenue_cents)}</td>
                    <td>{formatMoney(row.metrics.cost_cents)}</td>
                    <td>{formatMoney(row.metrics.profit_cents)}</td>
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
            <h3 className="font-semibold">Trends</h3>
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
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <select
        className="w-full rounded-md border border-[var(--velo-border)] bg-transparent px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
        <div className="mb-2 text-sm font-medium">Clicks & leads</div>
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
                  title={`${point.leads} leads`}
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
              <div
                className="w-full max-w-4 rounded-t bg-[var(--velo-ink)]"
                style={{ height: `${(point.revenue_cents / maxRevenue) * 100}%` }}
                title={formatMoney(point.revenue_cents)}
              />
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
