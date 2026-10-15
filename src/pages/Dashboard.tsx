import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AdminPanel } from "../components/AdminPanel";
import { CampaignReportPanel } from "../components/CampaignReport";
import { EntityPanel } from "../components/EntityPanel";
import { PathEditor } from "../components/PathEditor";
import { PostbackList } from "../components/PostbackList";
import { McpPanel } from "../components/McpPanel";
import { OpsPanel, NotesPanel } from "../components/OpsPanel";
import { CodeBlock } from "../components/CodeBlock";
import { ErrorBox, Field, Shell } from "../components/ui";
import { snippetScriptTag } from "../lib/integration-examples";
import {
  api,
  formatMoney,
  formatPercent,
  type ClickLogRow,
  type ConversionLogRow,
  type Program,
  type ProgramStats,
  type ProgramTracking,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { appBaseUrl } from "../lib/constants";
import { eventLabel, sortEvents } from "../lib/events";
import { CampaignSourcePanel } from "../components/SourceTemplates";

type Tab = "overview" | "clicklog" | "conversions";
type EntityView =
  | "campaigns"
  | "reports"
  | "sources"
  | "networks"
  | "offers"
  | "landers"
  | "groups"
  | "settings"
  | "mcp"
  | "admin";

const ENTITY_NAV: { key: EntityView; label: string }[] = [
  { key: "campaigns", label: "Campaigns" },
  { key: "reports", label: "Reports" },
  { key: "sources", label: "Traffic sources" },
  { key: "networks", label: "Aff. networks" },
  { key: "offers", label: "Offers" },
  { key: "landers", label: "Landers" },
  { key: "groups", label: "Groups" },
  { key: "settings", label: "Settings" },
  { key: "mcp", label: "AI / MCP" },
];

export function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "overview";
  const entity = (searchParams.get("entity") as EntityView) || "campaigns";

  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [stats, setStats] = useState<ProgramStats | null>(null);
  const [tracking, setTracking] = useState<ProgramTracking | null>(null);
  const [clicks, setClicks] = useState<ClickLogRow[]>([]);
  const [conversions, setConversions] = useState<ConversionLogRow[]>([]);
  const [programName, setProgramName] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [editName, setEditName] = useState("");
  const [editDestinationUrl, setEditDestinationUrl] = useState("");
  const settingsSyncedFor = useRef<string | null>(null);
  const [affiliateName, setAffiliateName] = useState("");
  const [lastLink, setLastLink] = useState("");
  const [convertSecretOnce, setConvertSecretOnce] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .programs()
      .then(({ programs: items }) => {
        setPrograms(items);
        if (items[0]) setSelectedId(items[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load campaigns"));
  }, [user]);

  useEffect(() => {
    if (!selectedId) {
      setStats(null);
      setTracking(null);
      setClicks([]);
      setConversions([]);
      return;
    }

    let cancelled = false;
    setStats(null);

    api
      .stats(selectedId)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stats");
        }
      });

    api
      .tracking(selectedId)
      .then(({ tracking: t }) => {
        if (!cancelled) setTracking(t);
      })
      .catch(() => {
        if (!cancelled) setTracking(null);
      });

    if (tab === "clicklog") {
      api
        .clicks(selectedId)
        .then(({ clicks: rows }) => {
          if (!cancelled) setClicks(rows);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to load clicklog");
          }
        });
    }

    if (tab === "conversions") {
      api
        .conversions(selectedId)
        .then(({ conversions: rows }) => {
          if (!cancelled) setConversions(rows);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to load conversions");
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [selectedId, lastLink, tab]);

  // Load the settings drafts once per selected campaign so refreshes keep unsaved edits.
  useEffect(() => {
    const program = programs.find((p) => p.id === selectedId) ?? stats?.program;
    if (!program || program.id !== selectedId || settingsSyncedFor.current === selectedId) return;
    settingsSyncedFor.current = selectedId;
    setEditName(program.name);
    setEditDestinationUrl(program.destination_url ?? "");
  }, [selectedId, programs, stats?.program]);

  function setEntity(next: EntityView) {
    const params: Record<string, string> = {};
    if (next !== "campaigns") params.entity = next;
    if (tab !== "overview") params.tab = tab;
    setSearchParams(params);
  }

  function setTab(next: Tab) {
    const params: Record<string, string> = {};
    if (entity !== "campaigns") params.entity = entity;
    if (next !== "overview") params.tab = next;
    setSearchParams(params);
  }

  if (loading) {
    return (
      <Shell>
        <div className="mx-auto max-w-6xl px-6 py-16 text-[var(--velo-muted)]">Loading...</div>
      </Shell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  async function createProgram(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { program, convert_secret } = await api.createProgram(programName, destinationUrl);
      setPrograms((prev) => [program, ...prev]);
      setSelectedId(program.id);
      setConvertSecretOnce(convert_secret);
      setProgramName("");
      setDestinationUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create campaign");
    } finally {
      setBusy(false);
    }
  }

  async function saveProgramSettings(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      const { program } = await api.updateProgram(selectedId, {
        name: editName.trim(),
        destination_url: editDestinationUrl.trim() || null,
      });
      setPrograms((prev) => prev.map((item) => (item.id === program.id ? program : item)));
      setEditName(program.name);
      setEditDestinationUrl(program.destination_url ?? "");
      if (stats) setStats({ ...stats, program });
      const { tracking: t } = await api.tracking(selectedId);
      setTracking(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update campaign");
    } finally {
      setBusy(false);
    }
  }

  async function createAffiliate(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      const { tracking_url } = await api.createAffiliate(selectedId, affiliateName);
      setAffiliateName("");
      setLastLink(tracking_url);
      const nextStats = await api.stats(selectedId);
      setStats(nextStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create affiliate");
    } finally {
      setBusy(false);
    }
  }

  async function cloneSelectedProgram() {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      const { program } = await api.cloneProgram(selectedId);
      setPrograms((prev) => [program, ...prev]);
      setSelectedId(program.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clone campaign");
    } finally {
      setBusy(false);
    }
  }

  const selectedProgram = programs.find((p) => p.id === selectedId) ?? stats?.program;
  const visibleStats = stats && stats.program.id === selectedId ? stats : null;

  return (
    <Shell
      cta={
        <>
          <Link className="btn btn-ghost" to="/docs">
            Docs
          </Link>
          <span className="hidden text-sm text-[var(--velo-muted)] sm:inline">{user.email}</span>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={async () => {
              await logout();
              window.location.href = "/login";
            }}
          >
            Sign out
          </button>
        </>
      }
    >
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-[var(--velo-muted)]">
            Campaigns, traffic, and conversions.
          </p>
        </div>

        <nav className="flex flex-wrap gap-2 border-b border-[var(--velo-border)] pb-4">
          {ENTITY_NAV.map(({ key, label }) => (
            <button
              key={key}
              className={`btn text-sm ${entity === key ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setEntity(key)}
              type="button"
            >
              {label}
            </button>
          ))}
          {user.is_platform_admin ? (
            <button
              className={`btn text-sm ${entity === "admin" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setEntity("admin")}
              type="button"
            >
              Admin
            </button>
          ) : null}
        </nav>

        {entity === "campaigns" && (
          <nav className="flex flex-wrap gap-2">
            {(
              [
                ["overview", "Overview"],
                ["clicklog", "Clicklog"],
                ["conversions", "Conversions"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={`btn text-sm ${tab === key ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setTab(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        <ErrorBox message={error} />

        {entity !== "campaigns" ? (
          entity === "admin" ? (
            <AdminPanel />
          ) : entity === "reports" ? (
            <CampaignReportPanel canWrite={user.role !== "viewer"} />
          ) : entity === "settings" ? (
            <OpsPanel role={user.role ?? "owner"} />
          ) : entity === "mcp" ? (
            <McpPanel />
          ) : (
            <EntityPanel kind={entity} canWrite={(user.role ?? "owner") !== "viewer"} />
          )
        ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <section className="card p-5">
            <h2 className="font-semibold">Campaigns</h2>
            <form className="mt-4 space-y-3" onSubmit={createProgram}>
              <Field
                label="New campaign name"
                placeholder="Acme SaaS affiliates"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                required
              />
              <Field
                label="Destination URL (optional)"
                type="url"
                placeholder="Empty = route through paths"
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
              />
              <button className="btn btn-primary w-full" disabled={busy} type="submit">
                Create campaign
              </button>
            </form>
            <div className="mt-5 space-y-2">
              {programs.map((program) => (
                <button
                  key={program.id}
                  className={`w-full rounded-md border px-3 py-2 text-left ${
                    selectedId === program.id
                      ? "border-[var(--velo-accent)] bg-[var(--velo-accent-soft)]"
                      : "border-[var(--velo-border)]"
                  }`}
                  onClick={() => setSelectedId(program.id)}
                  type="button"
                >
                  <div className="font-medium">{program.name}</div>
                  <div className="mono text-[var(--velo-muted)]">
                    {program.campaign_key ?? program.slug}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            {!selectedProgram ? (
              <div className="card p-8 text-[var(--velo-muted)]">
                Create your first program to start tracking.
              </div>
            ) : tab === "clicklog" ? (
              <ClicklogTable clicks={clicks} programId={selectedId} />
            ) : tab === "conversions" ? (
              <ConversionsTable conversions={conversions} programId={selectedId} />
            ) : (
              <OverviewPanel
                busy={busy}
                canWrite={(user.role ?? "owner") !== "viewer"}
                convertSecretOnce={convertSecretOnce}
                lastLink={lastLink}
                selectedId={selectedId}
                selectedProgram={selectedProgram}
                tracking={tracking}
                visibleStats={visibleStats}
                editName={editName}
                editDestinationUrl={editDestinationUrl}
                affiliateName={affiliateName}
                onAffiliateNameChange={setAffiliateName}
                onNameChange={setEditName}
                onDestinationChange={setEditDestinationUrl}
                onCreateAffiliate={createAffiliate}
                onSaveSettings={saveProgramSettings}
                onClone={cloneSelectedProgram}
              />
            )}
          </section>
        </div>
        )}
      </div>
    </Shell>
  );
}

function OverviewPanel({
  busy,
  canWrite,
  convertSecretOnce,
  lastLink,
  selectedId,
  selectedProgram,
  tracking,
  visibleStats,
  editName,
  editDestinationUrl,
  affiliateName,
  onAffiliateNameChange,
  onNameChange,
  onDestinationChange,
  onCreateAffiliate,
  onSaveSettings,
  onClone,
}: {
  busy: boolean;
  canWrite: boolean;
  convertSecretOnce: string;
  lastLink: string;
  selectedId: string;
  selectedProgram: Program;
  tracking: ProgramTracking | null;
  visibleStats: ProgramStats | null;
  editName: string;
  editDestinationUrl: string;
  affiliateName: string;
  onAffiliateNameChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onDestinationChange: (v: string) => void;
  onCreateAffiliate: (e: FormEvent) => void;
  onSaveSettings: (e: FormEvent) => void;
  onClone: () => void;
}) {
  const base = appBaseUrl();
  const eventNames = sortEvents(Object.keys(visibleStats?.totals.events ?? {}));
  return (
    <>
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-semibold">Tracking & postback</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            {canWrite && (
              <button
                className="underline"
                disabled={busy}
                onClick={onClone}
                type="button"
              >
                Clone campaign
              </button>
            )}
            <Link className="underline" to="/docs/postback">
              Postback docs
            </Link>
            <Link className="underline" to="/docs/server-conversions">
              Integration docs
            </Link>
          </div>
        </div>

        {convertSecretOnce && (
          <div className="mt-4 rounded-md border border-[var(--velo-ink)] bg-white p-4">
            <p className="text-sm font-semibold">
              Campaign secret (shown once — server-side only)
            </p>
            <p className="mono mt-2 break-all text-sm">{convertSecretOnce}</p>
          </div>
        )}

        {tracking && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-[var(--velo-muted)]">
              Incoming postback URL (configure in affiliate network):
            </p>
            <CodeBlock>{tracking.postback_url}</CodeBlock>
            <p className="text-sm text-[var(--velo-muted)]">
              Several events per campaign? Give the network one URL per event. Each event is
              counted on its own in stats:
            </p>
            <CodeBlock>
              {`${tracking.postback_url}&event=registration\n${tracking.postback_url}&event=ftd`}
            </CodeBlock>
            {tracking.campaign_url && (
              <>
                <p className="text-sm text-[var(--velo-muted)]">Campaign click URL:</p>
                <CodeBlock>{tracking.campaign_url}</CodeBlock>
              </>
            )}
            <p className="text-sm text-[var(--velo-muted)]">
              Attribution snippet for your merchant site:
            </p>
            <CodeBlock>{snippetScriptTag(base)}</CodeBlock>
          </div>
        )}

        <form className="mt-4 space-y-3" onSubmit={onSaveSettings}>
          <Field
            label="Campaign name"
            required
            value={editName}
            onChange={(e) => onNameChange(e.target.value)}
          />
          <Field
            label="Destination URL (optional)"
            type="url"
            placeholder="Empty = route through paths"
            value={editDestinationUrl}
            onChange={(e) => onDestinationChange(e.target.value)}
          />
          <button className="btn btn-secondary" disabled={busy} type="submit">
            Save settings
          </button>
        </form>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold">Outgoing postbacks</h2>
        <div className="mt-4">
          <PostbackList
            owner={{ campaign_id: selectedId }}
            canWrite={canWrite}
            hint="Called on every conversion of this campaign, including status changes. Add one per event (registration, FTD, ...) to report each to your traffic source."
          />
        </div>
      </div>

      <CampaignSourcePanel programId={selectedId} canWrite={canWrite} />

      <PathEditor programId={selectedId} />

      <NotesPanel canWrite={canWrite} entityId={selectedId} entityType="program" />

      <div className="card p-5">
        <h2 className="font-semibold">Add affiliate</h2>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={onCreateAffiliate}>
          <Field
            label="Affiliate name"
            placeholder="Jane Partner"
            value={affiliateName}
            onChange={(e) => onAffiliateNameChange(e.target.value)}
            required
          />
          <button
            className="btn btn-primary self-end sm:mt-7"
            disabled={busy}
            type="submit"
          >
            Create link
          </button>
        </form>
        {lastLink && (
          <p className="mono mt-4 break-all rounded-md bg-[var(--velo-accent-soft)] p-3 text-sm">
            {lastLink}
          </p>
        )}
      </div>

      {visibleStats && (
        <>
          <div className="stat-grid">
            <div className="card stat">
              <div className="stat-label">Clicks</div>
              <div className="stat-value">{visibleStats.totals.clicks}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">Conversions</div>
              <div className="stat-value">{visibleStats.totals.conversions}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">Revenue</div>
              <div className="stat-value">{formatMoney(visibleStats.totals.revenue_cents)}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">CR</div>
              <div className="stat-value">{formatPercent(visibleStats.totals.conversion_rate)}</div>
            </div>
            {eventNames.map((name) => (
              <div className="card stat" key={name}>
                <div className="stat-label">{eventLabel(name)}</div>
                <div className="stat-value">{visibleStats.totals.events[name]}</div>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden p-5">
            <h2 className="font-semibold">Affiliates</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Clicks</th>
                    <th>Leads</th>
                    {eventNames.map((name) => (
                      <th key={name}>{eventLabel(name)}</th>
                    ))}
                    <th>Revenue</th>
                    <th>CR</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStats.affiliates.map((affiliate) => (
                    <tr key={affiliate.id}>
                      <td>{affiliate.name}</td>
                      <td className="mono">{affiliate.code}</td>
                      <td>{affiliate.clicks}</td>
                      <td>{affiliate.conversions}</td>
                      {eventNames.map((name) => (
                        <td key={name}>{affiliate.events[name] ?? 0}</td>
                      ))}
                      <td>{formatMoney(affiliate.revenue_cents)}</td>
                      <td>{formatPercent(affiliate.conversion_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ClicklogTable({ clicks, programId }: { clicks: ClickLogRow[]; programId: string }) {
  return (
    <div className="card overflow-hidden p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Clicklog</h2>
        <a
          className="btn btn-secondary text-sm"
          href={`/api/reports/clicks.csv?program_id=${programId}`}
        >
          Export CSV
        </a>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Click ID</th>
              <th>Affiliate</th>
              <th>IP</th>
              <th>Converted</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {clicks.length === 0 && (
              <tr>
                <td colSpan={5} className="text-[var(--velo-muted)]">
                  No clicks yet.
                </td>
              </tr>
            )}
            {clicks.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.id}</td>
                <td>
                  {row.affiliate_name}{" "}
                  <span className="mono text-[var(--velo-muted)]">({row.affiliate_code})</span>
                </td>
                <td className="mono">{row.ip ?? "—"}</td>
                <td>{row.converted ? "Yes" : "No"}</td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConversionsTable({
  conversions,
  programId,
}: {
  conversions: ConversionLogRow[];
  programId: string;
}) {
  return (
    <div className="card overflow-hidden p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Conversions</h2>
        <a
          className="btn btn-secondary text-sm"
          href={`/api/reports/conversions.csv?program_id=${programId}`}
        >
          Export CSV
        </a>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Click ID</th>
              <th>Affiliate</th>
              <th>Event</th>
              <th>Status</th>
              <th>Revenue</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {conversions.length === 0 && (
              <tr>
                <td colSpan={7} className="text-[var(--velo-muted)]">
                  No conversions yet.
                </td>
              </tr>
            )}
            {conversions.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.order_id}</td>
                <td className="mono">{row.click_id ?? "—"}</td>
                <td>{row.affiliate_name}</td>
                <td className="mono">{row.event ?? "—"}</td>
                <td>
                  {row.status}
                  {row.status2 ? ` / ${row.status2}` : ""}
                </td>
                <td>{formatMoney(row.amount_cents)}</td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
