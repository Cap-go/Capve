import { useEffect, useMemo, useState } from "react";
import { DateRangePicker } from "./DateRangePicker";
import {
  api,
  formatMoney,
  formatPercent,
  type GroupedReportRow,
  type TrendPoint,
} from "../lib/api";
import { dimensionLabel, REPORT_DIMENSIONS } from "../lib/report-dimensions";
import { eventLabel, sortEvents } from "../lib/events";
import { useReportRowActions } from "./ReportRowActions";

type Preset = "7d" | "14d" | "30d" | "this_month" | "custom";
type SeriesKey = "clicks" | "leads" | "cost" | "revenue";

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "custom", label: "Custom range" },
];

const SERIES: Array<{ id: string; label: string; left: SeriesKey; right: SeriesKey }> = [
  { id: "cost-leads", label: "Cost – Conversions", left: "cost", right: "leads" },
  { id: "clicks-leads", label: "Clicks – Conversions", left: "clicks", right: "leads" },
  { id: "revenue-cost", label: "Revenue – Cost", left: "revenue", right: "cost" },
  { id: "clicks-cost", label: "Clicks – Cost", left: "clicks", right: "cost" },
];

const DIM_ORDER = [
  "country",
  "region",
  "city",
  "traffic_source",
  "path",
  "offer",
  "lander",
  "network",
  "affiliate",
  "device_type",
  "os",
  "browser",
  "language",
  "connection",
  "isp",
  "asn",
  "referrer_domain",
  "external_id",
  ...Array.from({ length: 10 }, (_, i) => `sub${i + 1}`),
];

const DAY_MS = 24 * 60 * 60 * 1000;
const LEFT_COLOR = "#e8872f";
const RIGHT_COLOR = "#3d7ec9";

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function rangeFor(preset: Preset, custom: { from: string; to: string }, now = new Date()): { from?: number; to?: number } {
  if (preset === "custom") {
    return {
      from: custom.from ? new Date(`${custom.from}T00:00:00`).getTime() : undefined,
      to: custom.to ? new Date(`${custom.to}T23:59:59.999`).getTime() : undefined,
    };
  }
  if (preset === "this_month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: now.getTime() };
  }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 14;
  const today = startOfDay(now);
  return { from: today - (days - 1) * DAY_MS, to: now.getTime() };
}

function formatDay(ms: number, withYear = false): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
  });
}

function rangeLabel(range: { from?: number; to?: number }): string {
  if (range.from == null || range.to == null) return "All time";
  return `${formatDay(range.from, true)} – ${formatDay(range.to, true)}`;
}

function isoLocal(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function blankPoint(date: string): TrendPoint {
  return { date, clicks: 0, lp_clicks: 0, leads: 0, revenue_cents: 0, cost_cents: 0, events: {} };
}

/** One point per calendar day in the range, so quiet days still draw on the axis. */
function withZeros(points: TrendPoint[], range: { from?: number; to?: number }): TrendPoint[] {
  if (range.from == null || range.to == null) {
    return [...points].sort((a, b) => a.date.localeCompare(b.date));
  }
  const end = startOfDay(new Date(range.to));
  const start = startOfDay(new Date(range.from));
  if (end - start > 120 * DAY_MS) {
    return [...points].sort((a, b) => a.date.localeCompare(b.date));
  }
  const byDate = new Map(points.map((point) => [point.date, point]));
  const out: TrendPoint[] = [];
  for (let cursor = start; cursor <= end; cursor += DAY_MS) {
    const date = isoLocal(cursor);
    out.push(byDate.get(date) ?? blankPoint(date));
    byDate.delete(date);
  }
  for (const extra of byDate.values()) out.push(extra);
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function seriesValue(point: TrendPoint, key: SeriesKey): number {
  if (key === "clicks") return point.clicks;
  if (key === "leads") return point.leads;
  if (key === "cost") return point.cost_cents;
  return point.revenue_cents;
}

function isMoney(key: SeriesKey): boolean {
  return key === "cost" || key === "revenue";
}

function seriesName(key: SeriesKey): string {
  if (key === "clicks") return "Clicks";
  if (key === "leads") return "Conversions";
  if (key === "cost") return "Cost";
  return "Revenue";
}

function axisLabel(value: number, money: boolean, currency: string): string {
  if (money) return formatMoney(value, currency);
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return "";
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

function DualAxisChart({
  points,
  leftKey,
  rightKey,
  currency,
}: {
  points: TrendPoint[];
  leftKey: SeriesKey;
  rightKey: SeriesKey;
  currency: string;
}) {
  const hasTraffic = points.some(
    (point) => point.clicks > 0 || point.leads > 0 || point.revenue_cents > 0 || point.cost_cents > 0,
  );
  if (!hasTraffic) {
    return <p className="perf-empty">No traffic in this period.</p>;
  }

  const width = 760;
  const height = 280;
  const pad = { l: 58, r: 58, t: 16, b: 32 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const leftValues = points.map((point) => seriesValue(point, leftKey));
  const rightValues = points.map((point) => seriesValue(point, rightKey));
  const leftMax = Math.max(...leftValues, 0);
  const rightMax = Math.max(...rightValues, 0);
  const leftScale = leftMax === 0 ? 1 : leftMax * 1.08;
  const rightScale = rightMax === 0 ? 1 : rightMax * 1.08;
  const xAt = (index: number) =>
    points.length === 1 ? pad.l + plotW / 2 : pad.l + (index / (points.length - 1)) * plotW;
  const yAt = (value: number, scale: number) => pad.t + plotH - (value / scale) * plotH;
  const leftPts = leftValues.map((value, index) => [xAt(index), yAt(value, leftScale)] as [number, number]);
  const rightPts = rightValues.map((value, index) => [xAt(index), yAt(value, rightScale)] as [number, number]);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <svg
      className="perf-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${seriesName(leftKey)} and ${seriesName(rightKey)} by day`}
    >
      {ticks.map((tick) => {
        const y = pad.t + plotH - tick * plotH;
        return (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="#ecece8" />
            <text x={pad.l - 8} y={y + 4} textAnchor="end" fill={LEFT_COLOR} fontSize="11">
              {axisLabel(tick * leftScale, isMoney(leftKey), currency)}
            </text>
            <text x={width - pad.r + 8} y={y + 4} textAnchor="start" fill={RIGHT_COLOR} fontSize="11">
              {axisLabel(tick * rightScale, isMoney(rightKey), currency)}
            </text>
          </g>
        );
      })}
      {points.map((point, index) =>
        index % labelEvery === 0 || index === points.length - 1 ? (
          <g key={point.date}>
            <line
              x1={xAt(index)}
              x2={xAt(index)}
              y1={pad.t}
              y2={pad.t + plotH}
              stroke="#f3f3f0"
            />
            <text x={xAt(index)} y={height - 8} textAnchor="middle" fill="#8a8a87" fontSize="11">
              {formatDay(new Date(`${point.date}T00:00:00`).getTime())}
            </text>
          </g>
        ) : null,
      )}
      <path d={smoothPath(leftPts)} fill="none" stroke={LEFT_COLOR} strokeWidth="2.5" strokeLinejoin="round" />
      <path d={smoothPath(rightPts)} fill="none" stroke={RIGHT_COLOR} strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((point, index) => {
        const left = seriesValue(point, leftKey);
        const right = seriesValue(point, rightKey);
        const tip = `${formatDay(new Date(`${point.date}T00:00:00`).getTime(), true)}: ${
          isMoney(leftKey) ? formatMoney(left, currency) : left
        } ${seriesName(leftKey).toLowerCase()}, ${
          isMoney(rightKey) ? formatMoney(right, currency) : right
        } ${seriesName(rightKey).toLowerCase()}`;
        return (
          <g key={`pt-${point.date}`}>
            <circle cx={leftPts[index][0]} cy={leftPts[index][1]} r="3" fill={LEFT_COLOR}>
              <title>{tip}</title>
            </circle>
            <circle cx={rightPts[index][0]} cy={rightPts[index][1]} r="3" fill={RIGHT_COLOR}>
              <title>{tip}</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

export function CampaignPerformance({
  programId,
  currency,
  canWrite,
}: {
  programId: string;
  currency: string;
  canWrite: boolean;
}) {
  const [preset, setPreset] = useState<Preset>("14d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [seriesId, setSeriesId] = useState(SERIES[0].id);
  const [dimension, setDimension] = useState("country");
  const [points, setPoints] = useState<TrendPoint[] | null>(null);
  const [rows, setRows] = useState<GroupedReportRow[]>([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  const range = useMemo(
    () => rangeFor(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo],
  );
  const series = SERIES.find((item) => item.id === seriesId) ?? SERIES[0];
  const dims = DIM_ORDER.map((value) => REPORT_DIMENSIONS.find((dim) => dim.value === value)).filter(
    (dim): dim is (typeof REPORT_DIMENSIONS)[number] => dim != null,
  );

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    api
      .campaignTrends(programId, range)
      .then(({ trends }) => {
        if (!cancelled) setPoints(trends);
      })
      .catch((err) => {
        if (!cancelled) {
          setPoints([]);
          setError(err instanceof Error ? err.message : "Failed to load the chart");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [programId, range.from, range.to]);

  useEffect(() => {
    let cancelled = false;
    api
      .groupedReport(dimension, { campaign_id: programId, from: range.from, to: range.to })
      .then(({ rows: next }) => {
        if (!cancelled) setRows(next);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [programId, dimension, range.from, range.to, version]);

  const actions = useReportRowActions({
    campaignId: programId,
    groupBy: dimension,
    from: range.from,
    to: range.to,
    onChanged: () => setVersion((value) => value + 1),
    onError: setError,
  });

  const totals = useMemo(() => {
    const list = points ?? [];
    const clicks = list.reduce((sum, point) => sum + point.clicks, 0);
    const leads = list.reduce((sum, point) => sum + point.leads, 0);
    const revenue = list.reduce((sum, point) => sum + point.revenue_cents, 0);
    const cost = list.reduce((sum, point) => sum + point.cost_cents, 0);
    const profit = revenue - cost;
    return {
      clicks,
      leads,
      revenue,
      cost,
      profit,
      cr: clicks > 0 ? (leads / clicks) * 100 : 0,
      epc: clicks > 0 ? revenue / clicks : 0,
      roi: cost > 0 ? (profit / cost) * 100 : null,
    };
  }, [points]);

  const events = sortEvents([...new Set(rows.flatMap((row) => Object.keys(row.events)))]);
  const showActions = canWrite && actions.hasActions;
  const needsCost = points != null && points.length > 0 && totals.cost === 0 && (totals.clicks > 0 || totals.leads > 0);

  return (
    <div className="perf">
      {needsCost && (
        <p className="perf-note" role="status">
          ROI is n/a until this campaign has a cost. Set it on the Budget tab, or send cost on the click.
        </p>
      )}
      {error && <p className="perf-note">{error}</p>}
      <div className="perf-layout">
        <div className="perf-main">
          <div className="perf-toolbar">
            <div className="perf-filter">
              <label>
                Group by
                <select aria-label="Breakdown" value={dimension} onChange={(e) => setDimension(e.target.value)}>
                  {dims.map((dim) => (
                    <option key={dim.value} value={dim.value}>
                      {dimensionLabel(dim.value)}
                    </option>
                  ))}
                </select>
              </label>
              <select className="perf-series" aria-label="Chart series" value={series.id} onChange={(e) => setSeriesId(e.target.value)}>
                {SERIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="perf-legend">
                <i style={{ background: LEFT_COLOR }} />
                {seriesName(series.left)}
                <i style={{ background: RIGHT_COLOR }} />
                {seriesName(series.right)}
              </span>
            </div>
            <div className="perf-range">
              <svg viewBox="0 0 16 16" aria-hidden="true" width="15" height="15">
                <rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M2 6.5h12M5 2v2.5M11 2v2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              <span>{rangeLabel(range)}</span>
              <select
                aria-label="Date range"
                value={preset}
                onChange={(e) => {
                  const next = e.target.value as Preset;
                  if (next === "custom") {
                    setRangeOpen(true);
                    return;
                  }
                  setPreset(next);
                }}
              >
                {PRESETS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              {preset === "custom" && (
                <button className="range-edit" type="button" onClick={() => setRangeOpen(true)}>
                  Edit
                </button>
              )}
            </div>
          </div>
          {rangeOpen && (
            <DateRangePicker
              from={customFrom}
              to={customTo}
              onClose={() => setRangeOpen(false)}
              onApply={(from, to) => {
                setCustomFrom(from);
                setCustomTo(to);
                setPreset("custom");
                setRangeOpen(false);
              }}
            />
          )}
          <div className="perf-kpis">
            <Kpi label="Clicks" value={points ? String(totals.clicks) : "…"} />
            <Kpi label="CR" value={points ? formatPercent(totals.cr) : "…"} />
            <Kpi label="Conversions" value={points ? String(totals.leads) : "…"} />
            <Kpi label="EPC" value={points ? formatMoney(totals.epc, currency) : "…"} />
            <Kpi label="Revenue" value={points ? formatMoney(totals.revenue, currency) : "…"} />
            <Kpi label="Cost" value={points ? formatMoney(totals.cost, currency) : "…"} />
            <Kpi label="Profit" value={points ? formatMoney(totals.profit, currency) : "…"} />
            <Kpi label="ROI" value={points ? (totals.roi == null ? "n/a" : formatPercent(totals.roi)) : "…"} />
          </div>
          {points == null ? (
            <p className="perf-empty">Loading chart…</p>
          ) : (
            <DualAxisChart
              points={withZeros(points, range)}
              leftKey={series.left}
              rightKey={series.right}
              currency={currency}
            />
          )}
          <div className="perf-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{dimensionLabel(dimension)}</th>
                  <th>Clicks</th>
                  <th>Conversions</th>
                  {events.map((name) => (
                    <th key={name}>{eventLabel(name)}</th>
                  ))}
                  <th>CR</th>
                  <th>Revenue</th>
                  <th>Cost</th>
                  <th>Profit</th>
                  <th>ROI</th>
                  {showActions && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8 + events.length + (showActions ? 1 : 0)} className="text-[var(--velo-muted)]">
                      No data for this period.
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.key ?? "__none"}>
                    <td className="font-medium">
                      {row.label}
                      {row.key != null && dimension === "path" && actions.pathEnabled(row.key) === false && (
                        <span className="ml-2 text-xs font-normal text-[var(--velo-muted)]">paused</span>
                      )}
                    </td>
                    <td>{row.metrics.clicks}</td>
                    <td>{row.metrics.leads}</td>
                    {events.map((name) => (
                      <td key={name}>{row.events[name] ?? 0}</td>
                    ))}
                    <td>{formatPercent(row.metrics.cr)}</td>
                    <td>{formatMoney(row.metrics.revenue_cents, row.currency)}</td>
                    <td>{formatMoney(row.metrics.cost_cents, row.currency)}</td>
                    <td>{formatMoney(row.metrics.profit_cents, row.currency)}</td>
                    <td>{formatPercent(row.metrics.roi)}</td>
                    {showActions && <td className="whitespace-nowrap">{actions.render(row)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="perf-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
