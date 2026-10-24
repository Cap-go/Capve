import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatMoney, formatPercent, type CampaignReportRow, type Program, type TrafficSource } from "../lib/api";
import { campaignHref } from "../lib/campaign-route";

const PAGE_SIZES = [25, 50, 100];

function formatCreated(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Campaign index: one row per campaign, with the stats the report API already has.
 * Opens `/app/campaign/performance?id=`.
 */
export function CampaignList({
  programs,
  reports,
  sources,
  loading,
  canWrite,
  creating,
  onToggleCreate,
  createForm,
}: {
  programs: Program[];
  reports: CampaignReportRow[] | null;
  sources: TrafficSource[];
  loading: boolean;
  canWrite: boolean;
  creating: boolean;
  onToggleCreate: () => void;
  createForm: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

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
          {canWrite && programs.length > 0 && (
            <button className={creating ? "btn btn-secondary" : "btn btn-primary"} type="button" onClick={onToggleCreate}>
              {creating ? "Cancel" : "Create a campaign"}
            </button>
          )}
        </div>
      </div>
      {createForm}
      <div className="table-wrap">
        <table className="table campaign-index-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Campaign</th>
              <th>ID</th>
              <th>Source</th>
              <th>Created</th>
              <th className="num">Clicks</th>
              <th className="num">Conversions</th>
              <th className="num">Revenue</th>
              <th className="num">Cost</th>
              <th className="num">Profit</th>
              <th className="num">ROI</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11}>Loading campaigns…</td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={11}>{programs.length === 0 ? "No campaigns yet." : "No campaigns match this filter."}</td>
              </tr>
            )}
            {visible.map((program) => {
              const report = reportById.get(program.id);
              const metrics = report?.metrics;
              const currency = report?.currency ?? "USD";
              const source =
                report?.traffic_source_name ??
                (program.traffic_source_id ? sourceName.get(program.traffic_source_id) : null);
              return (
                <tr key={program.id}>
                  <td>
                    <span className={`list-status is-${program.status}`}>{program.status}</span>
                  </td>
                  <td>
                    <Link to={campaignHref(program.id)}>{program.name}</Link>
                    <small className="mono">{program.campaign_key ?? program.slug}</small>
                  </td>
                  <td className="mono">{program.id}</td>
                  <td>{source || "—"}</td>
                  <td className="mono">{formatCreated(program.created_at)}</td>
                  <td className="num">{metrics ? metrics.clicks : "…"}</td>
                  <td className="num">{metrics ? metrics.leads : "…"}</td>
                  <td className="num">{metrics ? formatMoney(metrics.revenue_cents, currency) : "…"}</td>
                  <td className="num">{metrics ? formatMoney(metrics.cost_cents, currency) : "…"}</td>
                  <td className="num">{metrics ? formatMoney(metrics.profit_cents, currency) : "…"}</td>
                  <td className="num">{metrics ? (metrics.roi == null ? "n/a" : formatPercent(metrics.roi)) : "…"}</td>
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
