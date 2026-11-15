import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  automationApi,
  type TrackingDomain,
  type TrackingDomainList,
  type TrackingDomainStatus,
} from "../lib/api-automation";
import { CopyButton, ErrorBox, Field } from "./ui";

function timeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

/** Report timezone and custom tracking domains (account level). */
export function AccountSettingsPanel({ canWrite }: { canWrite: boolean }) {
  const zones = useMemo(timeZones, []);
  const [timezone, setTimezone] = useState("UTC");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    automationApi
      .settings()
      .then(({ settings }) => setTimezone(settings.timezone))
      .catch(() => {});
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function saveTimezone(e: FormEvent) {
    e.preventDefault();
    return run(async () => {
      const { settings } = await automationApi.updateSettings({ timezone });
      setTimezone(settings.timezone);
      setNotice(`Reports now use ${settings.timezone}.`);
    });
  }

  return (
    <div className="card space-y-6 p-5">
      <ErrorBox message={error} />
      {notice && <p className="text-sm">{notice}</p>}

      <form className="space-y-3" onSubmit={saveTimezone}>
        <h2 className="font-semibold">Report timezone</h2>
        <p className="text-sm text-[var(--velo-muted)]">
          Days in reports (date grouping, trends, date ranges) start at midnight in this timezone.
          The UTC offset is taken at the start of the report range.
        </p>
        <div className="settings-field-row">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--velo-muted)]">Timezone (IANA)</span>
            <input
              className="input"
              disabled={!canWrite}
              list="capve-timezones"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>
          {canWrite && (
            <button className="btn btn-secondary" disabled={busy} type="submit">
              Save timezone
            </button>
          )}
        </div>
        <datalist id="capve-timezones">
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      </form>

      <TrackingDomains canWrite={canWrite} />
    </div>
  );
}

const STATUS_CLASS: Record<TrackingDomainStatus, string> = {
  active: "is-active",
  pending: "is-paused",
  failed: "is-failed",
  manual: "",
};

function statusLabel(domain: TrackingDomain): string {
  if (domain.status === "active") return "Active";
  if (domain.status === "failed") return "Needs attention";
  if (domain.ssl_status === "pending_issuance" || domain.ssl_status === "pending_deployment") {
    return "Issuing HTTPS";
  }
  return "Waiting for DNS";
}

/** While a domain isn't live, the list re-checks it with Cloudflare this often. */
const POLL_MS = 20_000;

/** Custom tracking domains: add, follow automatic setup, remove. */
function TrackingDomains({ canWrite }: { canWrite: boolean }) {
  const [list, setList] = useState<TrackingDomainList | null>(null);
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  // Bumped by every add/remove, so a slower status check can't bring back an older list.
  const version = useRef(0);

  const refresh = useCallback(async () => {
    const started = version.current;
    const data = await automationApi.trackingDomains();
    if (version.current === started) setList(data);
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const domains = list?.tracking_domains ?? [];
  // Pending and failed domains are re-checked, so a fixed CNAME shows up without a reload.
  const waiting = domains.some((domain) => domain.status === "pending" || domain.status === "failed");

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, refresh]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      version.current += 1;
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function addDomain(e: FormEvent) {
    e.preventDefault();
    return run(async () => {
      const { tracking_domain } = await automationApi.addTrackingDomain(hostname);
      setList((prev) =>
        prev && {
          ...prev,
          tracking_domains: [...prev.tracking_domains, tracking_domain].sort((a, b) =>
            a.hostname.localeCompare(b.hostname),
          ),
        },
      );
      setHostname("");
    });
  }

  function removeDomain(domain: TrackingDomain) {
    return run(async () => {
      await automationApi.deleteTrackingDomain(domain.id);
      setList(
        (prev) =>
          prev && { ...prev, tracking_domains: prev.tracking_domains.filter((d) => d.id !== domain.id) },
      );
    });
  }

  async function checkNow() {
    setChecking(true);
    setError("");
    try {
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Tracking domains</h2>
      <p className="text-sm text-[var(--velo-muted)]">
        Serve campaign links from your own hostname (only <code>/r</code>, <code>/c</code>,{" "}
        <code>/lp</code> and <code>/click</code>). {list?.setup}
      </p>
      <ErrorBox message={error} />
      <ul className="space-y-3">
        {list && domains.length === 0 && (
          <li className="text-sm text-[var(--velo-muted)]">No tracking domains.</li>
        )}
        {domains.map((domain) => (
          <li className="tracking-domain" key={domain.id}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="mono break-all">{domain.hostname}</span>
                {domain.status !== "manual" && (
                  <span className={`status-pill tracking-domain-status ${STATUS_CLASS[domain.status]}`}>
                    <span className={`status-dot ${STATUS_CLASS[domain.status]}`} />
                    {statusLabel(domain)}
                  </span>
                )}
              </div>
              {canWrite && (
                <button
                  className="text-sm underline"
                  disabled={busy}
                  onClick={() => removeDomain(domain)}
                  type="button"
                >
                  Remove
                </button>
              )}
            </div>
            {domain.status !== "active" && domain.dns_records.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm">Add this record at your DNS provider:</p>
                {domain.dns_records.map((record) => (
                  <dl className="tracking-domain-record" key={`${record.type}:${record.name}`}>
                    <div>
                      <dt>Type</dt>
                      <dd className="mono">{record.type}</dd>
                    </div>
                    <div>
                      <dt>Name</dt>
                      <dd>
                        <span className="mono min-w-0 break-all">{record.name}</span>
                        <CopyButton text={record.name} />
                      </dd>
                    </div>
                    <div>
                      <dt>Target</dt>
                      <dd>
                        <span className="mono min-w-0 break-all">{record.value}</span>
                        <CopyButton text={record.value} />
                      </dd>
                    </div>
                  </dl>
                ))}
                <p className="text-xs text-[var(--velo-muted)]">
                  If your DNS is on Cloudflare, set the record to DNS only. Once the record is live,
                  Capve issues the HTTPS certificate, usually within a few minutes. This page checks
                  again every 20 seconds.
                </p>
              </div>
            )}
            {domain.status === "active" && list?.automatic && (
              <p className="mt-2 text-xs text-[var(--velo-muted)]">
                HTTPS is live. Keep the CNAME to <span className="mono">{list.cname_target}</span> in place.
              </p>
            )}
            {domain.status !== "active" && domain.errors.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                {domain.errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {waiting && (
        <button className="btn btn-secondary" disabled={checking} onClick={checkNow} type="button">
          {checking ? "Checking…" : "Check now"}
        </button>
      )}
      {canWrite && (
        <form className="settings-field-row" onSubmit={addDomain}>
          <Field
            label="Hostname"
            placeholder="track.example.com"
            required
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy} type="submit">
            Add domain
          </button>
        </form>
      )}
    </section>
  );
}

/** Picks the tracking domain used by one campaign's links. */
export function TrackingDomainPicker({
  campaignId,
  currentId,
  canWrite,
  onChanged,
}: {
  campaignId: string;
  currentId: string | null;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [domains, setDomains] = useState<TrackingDomain[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    automationApi
      .trackingDomains()
      .then((data) => setDomains(data.tracking_domains))
      .catch(() => {});
  }, []);

  if (domains.length === 0) return null;

  return (
    <label className="block max-w-sm space-y-2">
      <span className="text-sm font-medium text-[var(--velo-muted)]">Tracking domain</span>
      <select
        className="input"
        disabled={!canWrite}
        value={currentId ?? ""}
        onChange={(e) => {
          setError("");
          automationApi
            .setCampaignTrackingDomain(campaignId, e.target.value || null)
            .then(onChanged)
            .catch((err) => setError(err instanceof Error ? err.message : "Update failed"));
        }}
      >
        <option value="">Default (app URL)</option>
        {domains.map((domain) => (
          <option key={domain.id} value={domain.id}>
            {domain.hostname}
            {domain.status === "pending" ? " (waiting for DNS)" : domain.status === "failed" ? " (needs attention)" : ""}
          </option>
        ))}
      </select>
      <ErrorBox message={error} />
    </label>
  );
}
