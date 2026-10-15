import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AdminPanel } from "../components/AdminPanel";
import { AccountSettingsPanel, TrackingDomainPicker } from "../components/AccountSettingsPanel";
import { AutomationPanel } from "../components/AutomationPanel";
import { CampaignReportPanel } from "../components/CampaignReport";
import { EntityPanel } from "../components/EntityPanel";
import { PathEditor } from "../components/PathEditor";
import { PostbackList } from "../components/PostbackList";
import { RoutingRules } from "../components/RoutingRules";
import { TrafficFilterPanel } from "../components/TrafficFilterPanel";
import { McpPanel } from "../components/McpPanel";
import { OpsPanel, NotesPanel } from "../components/OpsPanel";
import { CodeBlock } from "../components/CodeBlock";
import {
  CopyButton,
  ErrorBox,
  Field,
  SavedNote,
  SecretBox,
  SelectField,
  Shell,
  confirmDelete,
  useSaveState,
} from "../components/ui";
import { snippetScriptTag } from "../lib/integration-examples";
import {
  api,
  formatMoney,
  formatPercent,
  otherCurrencies,
  type ClickLogRow,
  type ConversionLogRow,
  type Group,
  type LogPage,
  type Program,
  type ProgramStats,
  type PostbackKey,
  type ProgramTracking,
  type TrafficSource,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { appBaseUrl } from "../lib/constants";
import { eventLabel, eventName, sortEvents } from "../lib/events";
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

const LOG_PAGE_SIZE = 50;

/** Shown once after creating a campaign, only while that campaign stays selected. */
type CampaignSecret = { programId: string; secret: string };
type AffiliateLink = { programId: string; url: string };

/** Origin of the tracking host (the Worker's APP_URL) taken from the postback URL. */
function trackingOrigin(tracking: ProgramTracking | null): string {
  if (tracking) {
    try {
      return new URL(tracking.postback_url).origin;
    } catch {
      // fall through
    }
  }
  return appBaseUrl();
}

function dayStart(value: string): number | undefined {
  return value ? new Date(`${value}T00:00:00`).getTime() : undefined;
}

function dayEnd(value: string): number | undefined {
  return value ? new Date(`${value}T23:59:59.999`).getTime() : undefined;
}

export function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "overview";
  const entity = (searchParams.get("entity") as EntityView) || "campaigns";

  const [programs, setPrograms] = useState<Program[]>([]);
  const [sources, setSources] = useState<TrafficSource[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [stats, setStats] = useState<ProgramStats | null>(null);
  const [tracking, setTracking] = useState<ProgramTracking | null>(null);
  const [programName, setProgramName] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [newSourceId, setNewSourceId] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [affiliateName, setAffiliateName] = useState("");
  const [lastLink, setLastLink] = useState<AffiliateLink | null>(null);
  const [secretOnce, setSecretOnce] = useState<CampaignSecret | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .programs()
      .then(({ programs: items }) => {
        setPrograms(items);
        if (items[0]) setSelectedId((current) => current || items[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load campaigns"));
  }, [user]);

  // Source and group pickers; reloaded when returning to campaigns so new entities show up.
  useEffect(() => {
    if (!user || entity !== "campaigns") return;
    api.trafficSources().then(({ traffic_sources }) => setSources(traffic_sources)).catch(() => {});
    api.groups().then(({ groups: items }) => setGroups(items)).catch(() => {});
  }, [user, entity]);

  // A stale error from another section, tab or campaign must not linger.
  useEffect(() => {
    setError("");
  }, [entity, tab, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setStats(null);
      setTracking(null);
      return;
    }

    let cancelled = false;
    setStats(null);
    setTracking(null);

    api
      .stats(selectedId)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load stats");
      });

    api
      .tracking(selectedId)
      .then(({ tracking: t }) => {
        if (!cancelled) setTracking(t);
      })
      .catch(() => {
        if (!cancelled) setTracking(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

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

  const canWrite = (user.role ?? "owner") !== "viewer";

  async function createProgram(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { program, convert_secret } = await api.createProgram({
        name: programName,
        destination_url: destinationUrl,
        traffic_source_id: newSourceId,
        group_id: newGroupId,
      });
      setPrograms((prev) => [program, ...prev]);
      setSelectedId(program.id);
      setSecretOnce({ programId: program.id, secret: convert_secret });
      setProgramName("");
      setDestinationUrl("");
      setNewSourceId("");
      setNewGroupId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create campaign");
    } finally {
      setBusy(false);
    }
  }

  function replaceProgram(program: Program) {
    setPrograms((prev) => prev.map((item) => (item.id === program.id ? program : item)));
    setStats((prev) => (prev && prev.program.id === program.id ? { ...prev, program } : prev));
  }

  async function createAffiliate(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const programId = selectedId;
    setBusy(true);
    setError("");
    try {
      const { tracking_url } = await api.createAffiliate(programId, affiliateName);
      setAffiliateName("");
      setLastLink({ programId, url: tracking_url });
      const nextStats = await api.stats(programId);
      setStats((prev) => (prev && prev.program.id !== programId ? prev : nextStats));
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

  async function deleteSelectedProgram(program: Program) {
    if (
      !confirmDelete(
        `campaign "${program.name}"`,
        "Its links stop redirecting. Clicks and conversions stay in reports (status: archived).",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.deleteProgram(program.id);
      const remaining = programs.filter((p) => p.id !== program.id);
      setPrograms(remaining);
      setSelectedId(remaining[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete campaign");
    } finally {
      setBusy(false);
    }
  }

  const selectedProgram = programs.find((p) => p.id === selectedId) ?? stats?.program;
  const visibleStats = stats && stats.program.id === selectedId ? stats : null;

  const navButton = (key: EntityView, label: string) => (
    <button
      key={key}
      className={`btn shrink-0 whitespace-nowrap text-sm ${entity === key ? "btn-primary" : "btn-secondary"}`}
      onClick={() => setEntity(key)}
      type="button"
    >
      {label}
    </button>
  );

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
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-[var(--velo-muted)]">Campaigns, traffic, and conversions.</p>
        </div>

        <nav
          aria-label="Dashboard sections"
          className="-mx-4 flex gap-2 overflow-x-auto border-b border-[var(--velo-border)] px-4 pb-4 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {ENTITY_NAV.map(({ key, label }) => navButton(key, label))}
          {user.is_platform_admin ? navButton("admin", "Admin") : null}
        </nav>

        {entity === "campaigns" && (
          <nav className="flex flex-wrap gap-2" aria-label="Campaign views">
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

        {user.email_verified === false ? <VerifyEmailBanner /> : null}

        <ErrorBox message={error} />

        {entity !== "campaigns" ? (
          entity === "admin" ? (
            <AdminPanel />
          ) : entity === "reports" ? (
            <CampaignReportPanel canWrite={canWrite} />
          ) : entity === "settings" ? (
            <div className="space-y-6">
              <AccountSettingsPanel canWrite={(user.role ?? "owner") !== "viewer"} />
              <OpsPanel role={user.role ?? "owner"} />
            </div>
          ) : entity === "mcp" ? (
            <McpPanel />
          ) : (
            <EntityPanel kind={entity} canWrite={canWrite} />
          )
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <section className="card min-w-0 p-5">
              <h2 className="font-semibold">Campaigns</h2>
              {canWrite && (
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
                  <SelectField
                    label="Traffic source"
                    value={newSourceId}
                    onChange={setNewSourceId}
                    options={[{ value: "", label: "None" }, ...sources.map((s) => ({ value: s.id, label: s.name }))]}
                  />
                  <SelectField
                    label="Group"
                    value={newGroupId}
                    onChange={setNewGroupId}
                    options={[{ value: "", label: "None" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
                  />
                  <button className="btn btn-primary w-full" disabled={busy} type="submit">
                    {busy ? "Creating…" : "Create campaign"}
                  </button>
                </form>
              )}
              <div className="mt-5 space-y-2">
                {programs.length === 0 && (
                  <p className="text-sm text-[var(--velo-muted)]">No campaigns yet.</p>
                )}
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
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{program.name}</span>
                      {program.status !== "active" && (
                        <span className="shrink-0 rounded border border-[var(--velo-border)] px-1.5 text-xs text-[var(--velo-muted)]">
                          {program.status}
                        </span>
                      )}
                    </div>
                    <div className="mono truncate text-[var(--velo-muted)]">
                      {program.campaign_key ?? program.slug}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="min-w-0 space-y-6">
              {!selectedProgram ? (
                <div className="card p-8 text-[var(--velo-muted)]">
                  Create your first campaign to start tracking.
                </div>
              ) : tab === "clicklog" ? (
                <ClicklogTable key={selectedId} programId={selectedId} onError={setError} />
              ) : tab === "conversions" ? (
                <ConversionsTable key={selectedId} programId={selectedId} onError={setError} />
              ) : (
                <OverviewPanel
                  key={selectedId}
                  busy={busy}
                  canWrite={canWrite}
                  secretOnce={secretOnce?.programId === selectedId ? secretOnce.secret : ""}
                  lastLink={lastLink?.programId === selectedId ? lastLink.url : ""}
                  selectedId={selectedId}
                  selectedProgram={selectedProgram}
                  sources={sources}
                  groups={groups}
                  tracking={tracking}
                  visibleStats={visibleStats}
                  affiliateName={affiliateName}
                  onAffiliateNameChange={setAffiliateName}
                  onCreateAffiliate={createAffiliate}
                  onProgramSaved={replaceProgram}
                  onError={setError}
                  onClone={cloneSelectedProgram}
                  onDelete={() => deleteSelectedProgram(selectedProgram)}
                  onTrackingChanged={() =>
                    api
                      .tracking(selectedId)
                      .then(({ tracking: t }) => setTracking(t))
                      .catch(() => undefined)
                  }
                />
              )}
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Section({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  return (
    <details className="card group min-w-0 p-5" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
        {title}
        <span className="text-sm font-normal text-[var(--velo-muted)] group-open:hidden">Show</span>
        <span className="hidden text-sm font-normal text-[var(--velo-muted)] group-open:inline">Hide</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function OverviewPanel({
  busy,
  canWrite,
  secretOnce,
  lastLink,
  selectedId,
  selectedProgram,
  sources,
  groups,
  tracking,
  visibleStats,
  affiliateName,
  onAffiliateNameChange,
  onCreateAffiliate,
  onProgramSaved,
  onError,
  onClone,
  onTrackingChanged,
  onDelete,
}: {
  busy: boolean;
  canWrite: boolean;
  secretOnce: string;
  lastLink: string;
  selectedId: string;
  selectedProgram: Program;
  sources: TrafficSource[];
  groups: Group[];
  tracking: ProgramTracking | null;
  visibleStats: ProgramStats | null;
  affiliateName: string;
  onAffiliateNameChange: (v: string) => void;
  onCreateAffiliate: (e: FormEvent) => void;
  onProgramSaved: (program: Program) => void;
  onError: (message: string) => void;
  onClone: () => void;
  onTrackingChanged: () => void;
  onDelete: () => void;
}) {
  const base = appBaseUrl();
  const origin = trackingOrigin(tracking);
  const eventNames = sortEvents(Object.keys(visibleStats?.totals.events ?? {}));
  // New campaigns open the setup sections; established ones lead with stats.
  const isNew = visibleStats ? visibleStats.totals.clicks === 0 : false;
  const save = useSaveState();
  const statusSave = useSaveState();
  const [draft, setDraft] = useState({
    name: selectedProgram.name,
    destination: selectedProgram.destination_url ?? "",
    sourceId: selectedProgram.traffic_source_id ?? "",
    groupId: selectedProgram.group_id ?? "",
  });
  const paused = selectedProgram.status === "paused";

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    onError("");
    try {
      const { program } = await save.run(() =>
        api.updateProgram(selectedId, {
          name: draft.name.trim(),
          destination_url: draft.destination.trim() || null,
          traffic_source_id: draft.sourceId || null,
          group_id: draft.groupId || null,
        }),
      );
      onProgramSaved(program);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update campaign");
    }
  }

  async function toggleStatus() {
    onError("");
    try {
      const { program } = await statusSave.run(() =>
        api.updateProgram(selectedId, { status: paused ? "active" : "paused" }),
      );
      onProgramSaved(program);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update status");
    }
  }

  const hasHiddenCampaignAffiliate = visibleStats?.affiliates.some(
    (a) => a.name === "Campaign traffic",
  );

  return (
    <>
      <div className="card min-w-0 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{selectedProgram.name}</h2>
            <p className="mt-1 text-sm text-[var(--velo-muted)]">
              Status: <strong className="text-[var(--velo-ink)]">{selectedProgram.status}</strong>
              {paused && " — links return 404 until resumed."}
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <SavedNote show={statusSave.saved} />
              <button
                className="btn btn-secondary text-sm"
                disabled={statusSave.saving}
                onClick={toggleStatus}
                type="button"
              >
                {statusSave.saving ? "Saving…" : paused ? "Resume campaign" : "Pause campaign"}
              </button>
              <button className="btn btn-secondary text-sm" disabled={busy} onClick={onClone} type="button">
                Clone
              </button>
              <button className="btn btn-secondary text-sm" disabled={busy} onClick={onDelete} type="button">
                Delete
              </button>
            </div>
          )}
        </div>
        {secretOnce && (
          <SecretBox title="Campaign secret (shown once — server-side only)" value={secretOnce} />
        )}
      </div>

      {visibleStats && (
        <>
          <div className="stat-grid">
            <div className="card stat">
              <div className="stat-label">Clicks</div>
              <div className="stat-value">{visibleStats.totals.clicks}</div>
              {visibleStats.totals.bots > 0 && (
                <div className="text-xs text-[var(--velo-muted)]">
                  {visibleStats.totals.bots} bots (not in CR)
                </div>
              )}
            </div>
            <div className="card stat">
              <div className="stat-label">Conversions</div>
              <div className="stat-value">{visibleStats.totals.conversions}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">Revenue</div>
              <div className="stat-value">
                {formatMoney(visibleStats.totals.revenue_cents, visibleStats.currency)}
              </div>
              {otherCurrencies(visibleStats.totals.revenue_by_currency, visibleStats.currency) && (
                <div className="text-xs text-[var(--velo-muted)]">
                  {otherCurrencies(visibleStats.totals.revenue_by_currency, visibleStats.currency)}
                </div>
              )}
            </div>
            <div className="card stat">
              <div className="stat-label">CR</div>
              <div className="stat-value">{formatPercent(visibleStats.totals.conversion_rate)}</div>
            </div>
            {eventNames.map((name) => (
              <div className="card stat" key={name}>
                <div className="stat-label">{eventLabel(name)}</div>
                <div className="stat-value">{visibleStats.totals.events[name]}</div>
                <div className="text-xs text-[var(--velo-muted)]">
                  CR {formatPercent(visibleStats.totals.event_metrics[name]?.cr ?? 0)} ·{" "}
                  {formatMoney(
                    visibleStats.totals.event_metrics[name]?.revenue_cents ?? 0,
                    visibleStats.currency,
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="card min-w-0 overflow-hidden p-5">
            <h2 className="font-semibold">Affiliates</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Tracking URL</th>
                    <th>Clicks</th>
                    <th>Conversions</th>
                    {eventNames.map((name) => (
                      <th key={name}>{eventLabel(name)}</th>
                    ))}
                    <th>Revenue</th>
                    <th>CR</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStats.affiliates.length === 0 && (
                    <tr>
                      <td colSpan={6 + eventNames.length} className="text-[var(--velo-muted)]">
                        No affiliates yet. Add one below to get a tracking link.
                      </td>
                    </tr>
                  )}
                  {visibleStats.affiliates.map((affiliate) => {
                    const url = `${origin}/r/${affiliate.code}`;
                    return (
                      <tr key={affiliate.id}>
                        <td>{affiliate.name}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="mono whitespace-nowrap text-xs">{url}</span>
                            <CopyButton text={url} />
                          </div>
                        </td>
                        <td>{affiliate.clicks}</td>
                        <td>{affiliate.conversions}</td>
                        {eventNames.map((name) => (
                          <td key={name}>{affiliate.events[name] ?? 0}</td>
                        ))}
                        <td>{formatMoney(affiliate.revenue_cents, visibleStats.currency)}</td>
                        <td>{formatPercent(affiliate.conversion_rate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {hasHiddenCampaignAffiliate && (
              <p className="mt-3 text-xs text-[var(--velo-muted)]">
                "Campaign traffic" is created automatically: it collects clicks on the campaign link (
                <span className="mono">/c/…</span>) that do not come from a specific affiliate.
              </p>
            )}
          </div>
        </>
      )}

      {canWrite && (
        <div className="card min-w-0 p-5">
          <h2 className="font-semibold">Add affiliate</h2>
          <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onCreateAffiliate}>
            <div className="min-w-0 flex-1">
              <Field
                label="Affiliate name"
                placeholder="Jane Partner"
                value={affiliateName}
                onChange={(e) => onAffiliateNameChange(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary" disabled={busy} type="submit">
              Create link
            </button>
          </form>
          {lastLink && (
            <div className="mt-4 flex items-start justify-between gap-3 rounded-md bg-[var(--velo-accent-soft)] p-3">
              <p className="mono min-w-0 break-all text-sm">{lastLink}</p>
              <CopyButton text={lastLink} />
            </div>
          )}
        </div>
      )}

      <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-[var(--velo-muted)]">
        Setup
      </h2>

      <Section title="Tracking & postback" defaultOpen={isNew}>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="underline" to="/docs/postback">
            Postback docs
          </Link>
          <Link className="underline" to="/docs/server-conversions">
            Integration docs
          </Link>
        </div>
        {tracking ? (
          <div className="mt-4 space-y-3">
            <TrackingDomainPicker
              campaignId={selectedId}
              currentId={tracking.tracking_domain?.id ?? null}
              canWrite={canWrite}
              onChanged={onTrackingChanged}
            />
            <p className="text-sm text-[var(--velo-muted)]">
              Incoming postback URL (configure in affiliate network). Without{" "}
              <span className="mono">cnv_status</span> a conversion is recorded as{" "}
              <span className="mono">lead</span>; send <span className="mono">approved</span>,{" "}
              <span className="mono">rejected</span>, … to set or update it.
            </p>
            <CodeBlock>{tracking.postback_url}</CodeBlock>
            {canWrite ? <PostbackKeyControls onChange={onTrackingChanged} /> : null}
            <p className="text-sm text-[var(--velo-muted)]">
              Several events per campaign? Give the network one URL per event. Each event is counted on
              its own in stats:
            </p>
            <CodeBlock>
              {`${tracking.postback_url}&event=registration\n${tracking.postback_url}&event=ftd`}
            </CodeBlock>
            {tracking.campaign_url && (
              <>
                <p className="text-sm text-[var(--velo-muted)]">
                  Campaign click URL (clicks are counted under "Campaign traffic"):
                </p>
                <CodeBlock>{tracking.campaign_url}</CodeBlock>
              </>
            )}
            <p className="text-sm text-[var(--velo-muted)]">Attribution snippet for your merchant site:</p>
            <CodeBlock>{snippetScriptTag(base)}</CodeBlock>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--velo-muted)]">Loading tracking…</p>
        )}
      </Section>

      {canWrite && (
        <Section title="Campaign settings" defaultOpen={false}>
          <form className="space-y-3" onSubmit={saveSettings}>
            <Field
              label="Campaign name"
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Field
              label="Destination URL (optional)"
              type="url"
              placeholder="Empty = route through paths"
              value={draft.destination}
              onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
            />
            <SelectField
              label="Traffic source"
              value={draft.sourceId}
              onChange={(v) => setDraft({ ...draft, sourceId: v })}
              options={[{ value: "", label: "None" }, ...sources.map((s) => ({ value: s.id, label: s.name }))]}
            />
            <SelectField
              label="Group"
              value={draft.groupId}
              onChange={(v) => setDraft({ ...draft, groupId: v })}
              options={[{ value: "", label: "None" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
            />
            <div className="flex items-center gap-3">
              <button className="btn btn-secondary" disabled={save.saving} type="submit">
                {save.saving ? "Saving…" : "Save settings"}
              </button>
              <SavedNote show={save.saved} />
            </div>
          </form>
        </Section>
      )}

      <Section title="Outgoing postbacks" defaultOpen={false}>
        <PostbackList
          owner={{ campaign_id: selectedId }}
          canWrite={canWrite}
          hint="Called on every conversion of this campaign, including status changes. Add one per event (registration, FTD, ...) to report each to your traffic source."
        />
      </Section>

      <AutomationPanel campaignId={selectedId} canWrite={canWrite} />

      <PathEditor programId={selectedId} trackingOrigin={origin} canWrite={canWrite} />
      <RoutingRules programId={selectedId} canWrite={canWrite} />
      <TrafficFilterPanel programId={selectedId} canWrite={canWrite} />
      <CampaignSourcePanel programId={selectedId} canWrite={canWrite} />

      <NotesPanel canWrite={canWrite} entityId={selectedId} entityType="program" />
    </>
  );
}

/** Date window + "Load more" paging shared by the clicklog and conversions tables. */
function useLog<T>(
  programId: string,
  load: (programId: string, page: LogPage) => Promise<T[]>,
  onError: (message: string) => void,
) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);

  async function fetchPage(offset: number) {
    const ticket = ++request.current;
    setLoading(true);
    try {
      const page = await load(programId, {
        limit: LOG_PAGE_SIZE,
        offset,
        from: dayStart(from),
        to: dayEnd(to),
      });
      if (ticket !== request.current) return;
      setRows((prev) => (offset === 0 ? page : [...prev, ...page]));
      setHasMore(page.length === LOG_PAGE_SIZE);
    } catch (err) {
      if (ticket === request.current) onError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (ticket === request.current) setLoading(false);
    }
  }

  useEffect(() => {
    fetchPage(0);
  }, [programId, from, to]);

  return { rows, from, to, setFrom, setTo, hasMore, loading, loadMore: () => fetchPage(rows.length) };
}

function LogToolbar({
  title,
  exportHref,
  log,
}: {
  title: string;
  exportHref: string;
  log: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 className="font-semibold">{title}</h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Field label="From" type="date" value={log.from} max={log.to || undefined} onChange={(e) => log.setFrom(e.target.value)} />
        </div>
        <div className="w-40">
          <Field label="To" type="date" value={log.to} min={log.from || undefined} onChange={(e) => log.setTo(e.target.value)} />
        </div>
        <a className="btn btn-secondary text-sm" href={exportHref}>
          Export CSV
        </a>
      </div>
    </div>
  );
}

function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore && !loading) return null;
  return (
    <div className="mt-4">
      <button className="btn btn-secondary text-sm" disabled={loading} onClick={onClick} type="button">
        {loading ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}

function csvHref(kind: "clicks" | "conversions", programId: string, from: string, to: string) {
  const params = new URLSearchParams({ program_id: programId });
  const start = dayStart(from);
  const end = dayEnd(to);
  if (start !== undefined) params.set("from", String(start));
  if (end !== undefined) params.set("to", String(end));
  return `/api/reports/${kind}.csv?${params}`;
}

function ClicklogTable({ programId, onError }: { programId: string; onError: (m: string) => void }) {
  const log = useLog<ClickLogRow>(
    programId,
    (id, page) => api.clicks(id, page).then((r) => r.clicks),
    onError,
  );
  return (
    <div className="card min-w-0 overflow-hidden p-5">
      <LogToolbar title="Clicklog" exportHref={csvHref("clicks", programId, log.from, log.to)} log={log} />
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
            {log.rows.length === 0 && !log.loading && (
              <tr>
                <td colSpan={5} className="text-[var(--velo-muted)]">
                  No clicks{log.from || log.to ? " in this period" : " yet"}.
                </td>
              </tr>
            )}
            {log.rows.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.id}</td>
                <td>
                  {row.affiliate_name}{" "}
                  <span className="mono text-[var(--velo-muted)]">({row.affiliate_code})</span>
                </td>
                <td className="mono">{row.ip ?? "—"}</td>
                <td>{row.converted ? "Yes" : "No"}</td>
                <td className="whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LoadMore hasMore={log.hasMore} loading={log.loading} onClick={log.loadMore} />
    </div>
  );
}

function ConversionsTable({ programId, onError }: { programId: string; onError: (m: string) => void }) {
  const log = useLog<ConversionLogRow>(
    programId,
    (id, page) => api.conversions(id, page).then((r) => r.conversions),
    onError,
  );
  return (
    <div className="card min-w-0 overflow-hidden p-5">
      <LogToolbar
        title="Conversions"
        exportHref={csvHref("conversions", programId, log.from, log.to)}
        log={log}
      />
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
            {log.rows.length === 0 && !log.loading && (
              <tr>
                <td colSpan={7} className="text-[var(--velo-muted)]">
                  No conversions{log.from || log.to ? " in this period" : " yet"}.
                </td>
              </tr>
            )}
            {log.rows.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.order_id}</td>
                <td className="mono">{row.click_id ?? "—"}</td>
                <td>{row.affiliate_name}</td>
                <td>{row.event ? eventName(row.event) : "—"}</td>
                <td>
                  {row.status}
                  {row.status2 ? ` / ${row.status2}` : ""}
                </td>
                <td>{formatMoney(row.amount_cents)}</td>
                <td className="whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LoadMore hasMore={log.hasMore} loading={log.loading} onClick={log.loadMore} />
    </div>
  );
}

function VerifyEmailBanner() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    setMessage("");
    try {
      const res = await api.resendVerification();
      setMessage(res.already_verified ? "Your email is already verified." : "Verification email sent.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send the email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <p>
        <span className="font-semibold">Verify your email.</span> Check your inbox for the link.
        Team invites need a verified email.
      </p>
      <div className="flex items-center gap-3">
        {message ? <span className="text-[var(--velo-muted)]">{message}</span> : null}
        <button className="btn btn-secondary" disabled={busy} onClick={resend} type="button">
          Resend email
        </button>
      </div>
    </div>
  );
}

function PostbackKeyControls({ onChange }: { onChange: () => void }) {
  const [settings, setSettings] = useState<PostbackKey | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .postbackKey()
      .then(({ postback_key }) => setSettings(postback_key))
      .catch(() => setSettings(null));
  }, []);

  async function update(action: () => Promise<{ postback_key: PostbackKey }>) {
    setBusy(true);
    setError("");
    try {
      const { postback_key } = await action();
      setSettings(postback_key);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update postback key");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return null;

  return (
    <div className="space-y-2 rounded-md border border-[var(--velo-border)] p-3 text-sm">
      <p>
        Postback key <span className="mono break-all">{settings.key}</span> (account-wide,
        sent as <code>&amp;key=</code>). Without a valid key, payouts are capped to the offer
        payout.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <input
            checked={settings.required}
            disabled={busy}
            onChange={(e) => {
              const required = e.target.checked;
              void update(() => api.setPostbackKeyRequired(required));
            }}
            type="checkbox"
          />
          Reject postbacks without the key
        </label>
        <button
          className="underline"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Rotate the key? Postback URLs with the old key stop working.")) {
              void update(() => api.rotatePostbackKey());
            }
          }}
          type="button"
        >
          Rotate key
        </button>
      </div>
      <ErrorBox message={error} />
    </div>
  );
}
