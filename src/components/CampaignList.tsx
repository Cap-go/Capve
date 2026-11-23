import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatMoney, formatPercent, type CampaignReportRow, type Program, type TrafficSource } from "../lib/api";
import { campaignHref } from "../lib/campaign-route";
import { PeriodSelector, rangeFor, type Preset, type PeriodRange } from "./PeriodSelector";

const PAGE_SIZES = [25, 50, 100];

type ColumnKey =
  | "status"
  | "campaign"
  | "id"
  | "source"
  | "created"
  | "clicks"
  | "registrations"
  | "ftd"
  | "conversions"
  | "revenue"
  | "cost"
  | "profit"
  | "roi";

type ColumnConfig = {
  key: ColumnKey;
  label: string;
  className?: string;
  defaultVisible: boolean;
};

const ALL_COLUMNS: ColumnConfig[] = [
  { key: "status", label: "Status", defaultVisible: true },
  { key: "campaign", label: "Campaign", defaultVisible: true },
  { key: "id", label: "ID", defaultVisible: false },
  { key: "source", label: "Source", defaultVisible: true },
  { key: "created", label: "Created", defaultVisible: true },
  { key: "clicks", label: "Clicks", className: "num", defaultVisible: true },
  { key: "registrations", label: "Registrations", className: "num", defaultVisible: true },
  { key: "ftd", label: "FTD", className: "num", defaultVisible: true },
  { key: "conversions", label: "Conversions", className: "num", defaultVisible: true },
  { key: "revenue", label: "Revenue", className: "num", defaultVisible: true },
  { key: "cost", label: "Cost", className: "num", defaultVisible: true },
  { key: "profit", label: "Profit", className: "num", defaultVisible: true },
  { key: "roi", label: "ROI", className: "num", defaultVisible: true },
];

const STORAGE_KEY = "capve_campaigns_columns";

function loadColumnVisibility(): Set<ColumnKey> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ColumnKey[];
      return new Set(parsed);
    }
  } catch {
    // fall through
  }
  return new Set(ALL_COLUMNS.filter((col) => col.defaultVisible).map((col) => col.key));
}

function saveColumnVisibility(visible: Set<ColumnKey>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visible]));
  } catch {
    // ignore
  }
}

function formatCreated(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Campaign index: one row per campaign, with the stats the report API already has.
 * Opens the campaign’s own performance URL.
 */
export function CampaignList({
  programs,
  reports,
  sources,
  loading,
  reportsLoading,
  reportsError,
  canWrite,
  creating,
  onToggleCreate,
  createForm,
  onPeriodChange,
  onRetryReports,
}: {
  programs: Program[];
  reports: CampaignReportRow[] | null;
  sources: TrafficSource[];
  loading: boolean;
  reportsLoading: boolean;
  reportsError: string | null;
  canWrite: boolean;
  creating: boolean;
  onToggleCreate: () => void;
  createForm: ReactNode;
  onPeriodChange: (range: PeriodRange) => void;
  onRetryReports: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [preset, setPreset] = useState<Preset>(() => {
    try {
      return (localStorage.getItem("capve_campaigns_period") as Preset) || "all_time";
    } catch {
      return "all_time";
    }
  });
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(loadColumnVisibility);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);

  useEffect(() => {
    const range = rangeFor(preset, { from: customFrom, to: customTo });
    onPeriodChange(range);
    try {
      localStorage.setItem("capve_campaigns_period", preset);
    } catch {
      // ignore
    }
  }, [preset, customFrom, customTo, onPeriodChange]);

  function handlePeriodChange(newPreset: Preset, newFrom: string, newTo: string) {
    setPreset(newPreset);
    setCustomFrom(newFrom);
    setCustomTo(newTo);
    setPage(0);
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      saveColumnVisibility(next);
      return next;
    });
  }

  const sourceName = useMemo(() => new Map(sources.map((source) => [source.id, source.name])), [sources]);
  const reportById = useMemo(() => new Map((reports ?? []).map((row) => [row.id, row])), [reports]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return programs.filter((program) => {
      if (status && program.status !== status) return false;
      if (!term) return true;
      const report = reportById.get(program.id);
      const source = report?.traffic_source_name ?? (program.traffic_source_id ? sourceName.get(program.traffic_source_id) : "");
      return `${program.name} ${program.id} ${program.campaign_key ?? ""} ${program.slug} ${source ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [programs, query, status, reportById, sourceName]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = rows.length === 0 ? 0 : safePage * pageSize;
  const visible = rows.slice(start, start + pageSize);

  const displayColumns = ALL_COLUMNS.filter((col) => visibleColumns.has(col.key));

  return (
    <section className="card campaign-index">
      <div className="campaign-index-toolbar">
        <div className="campaign-index-filters">
          <select
            aria-label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          <p>
            {loading
              ? "Loading campaigns…"
              : rows.length === 0
                ? "Showing 0 of 0"
                : `Showing ${start + 1}–${start + visible.length} of ${rows.length}`}
          </p>
        </div>
        <div className="campaign-index-filters">
          <PeriodSelector
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onChange={handlePeriodChange}
          />
          <input
            type="search"
            aria-label="Search campaigns"
            placeholder="Search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(0);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <div className="relative">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setColumnsMenuOpen((open) => !open)}
              aria-label="Columns"
            >
              Columns
            </button>
            {columnsMenuOpen && (
              <div className="columns-menu">
                <div className="columns-menu-backdrop" onClick={() => setColumnsMenuOpen(false)} />
                <div className="columns-menu-panel">
                  <h3>Show columns</h3>
                  {ALL_COLUMNS.map((col) => (
                    <label key={col.key}>
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(col.key)}
                        onChange={() => toggleColumn(col.key)}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          {canWrite && programs.length > 0 && (
            <button className={creating ? "btn btn-secondary" : "btn btn-primary"} type="button" onClick={onToggleCreate}>
              {creating ? "Cancel" : "Create a campaign"}
            </button>
          )}
        </div>
      </div>
      {createForm}
      {reportsError && (
        <div
          className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-md border border-red-300 bg-white px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          <p>Failed to load stats: {reportsError}</p>
          <button className="btn btn-secondary" type="button" onClick={onRetryReports}>
            Retry
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table className="table campaign-index-table">
          <thead>
            <tr>
              {displayColumns.map((col) => (
                <th key={col.key} className={col.className}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={displayColumns.length}>Loading campaigns…</td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={displayColumns.length}>
                  {programs.length === 0 ? "No campaigns yet." : "No campaigns match this filter."}
                </td>
              </tr>
            )}
            {visible.map((program) => {
              const report = reportById.get(program.id);
              const metrics = report?.metrics;
              const currency = report?.currency ?? "USD";
              const source =
                report?.traffic_source_name ??
                (program.traffic_source_id ? sourceName.get(program.traffic_source_id) : null);
              const events = report?.events ?? {};
              const registrations = events.registration ?? 0;
              const ftd = events.ftd ?? 0;

              return (
                <tr key={program.id}>
                  {visibleColumns.has("status") && (
                    <td>
                      <span className={`list-status is-${program.status}`}>{program.status}</span>
                    </td>
                  )}
                  {visibleColumns.has("campaign") && (
                    <td>
                      <Link to={campaignHref(program.id)}>{program.name}</Link>
                      <small className="mono">{program.campaign_key ?? program.slug}</small>
                    </td>
                  )}
                  {visibleColumns.has("id") && <td className="mono">{program.id}</td>}
                  {visibleColumns.has("source") && <td>{source || "—"}</td>}
                  {visibleColumns.has("created") && <td className="mono">{formatCreated(program.created_at)}</td>}
                  {visibleColumns.has("clicks") && (
                    <td className="num">{reportsLoading ? "…" : metrics ? metrics.clicks : "—"}</td>
                  )}
                  {visibleColumns.has("registrations") && (
                    <td className="num">{reportsLoading ? "…" : metrics ? registrations : "—"}</td>
                  )}
                  {visibleColumns.has("ftd") && (
                    <td className="num">{reportsLoading ? "…" : metrics ? ftd : "—"}</td>
                  )}
                  {visibleColumns.has("conversions") && (
                    <td className="num">{reportsLoading ? "…" : metrics ? metrics.leads : "—"}</td>
                  )}
                  {visibleColumns.has("revenue") && (
                    <td className="num">{reportsLoading ? "…" : metrics ? formatMoney(metrics.revenue_cents, currency) : "—"}</td>
                  )}
                  {visibleColumns.has("cost") && (
                    <td className="num">{reportsLoading ? "…" : metrics ? formatMoney(metrics.cost_cents, currency) : "—"}</td>
                  )}
                  {visibleColumns.has("profit") && (
                    <td className="num">{reportsLoading ? "…" : metrics ? formatMoney(metrics.profit_cents, currency) : "—"}</td>
                  )}
                  {visibleColumns.has("roi") && (
                    <td className="num">{reportsLoading ? "…" : metrics ? (metrics.roi == null ? "n/a" : formatPercent(metrics.roi)) : "—"}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="campaign-index-pager">
          <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            Previous
          </button>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
