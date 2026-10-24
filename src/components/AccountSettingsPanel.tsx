import { FormEvent, useEffect, useMemo, useState } from "react";
import { automationApi, type TrackingDomain } from "../lib/api-automation";
import { ErrorBox, Field } from "./ui";

function timeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

/** Report timezone and custom tracking domains (account level). */
export function AccountSettingsPanel({ canWrite }: { canWrite: boolean }) {
  const zones = useMemo(timeZones, []);
  const [timezone, setTimezone] = useState("UTC");
  const [domains, setDomains] = useState<TrackingDomain[]>([]);
  const [setup, setSetup] = useState("");
  const [hostname, setHostname] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    automationApi
      .settings()
      .then(({ settings }) => setTimezone(settings.timezone))
      .catch(() => {});
    automationApi
      .trackingDomains()
      .then((data) => {
        setDomains(data.tracking_domains);
        setSetup(data.setup);
      })
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

  function addDomain(e: FormEvent) {
    e.preventDefault();
    return run(async () => {
      const { tracking_domain } = await automationApi.addTrackingDomain(hostname);
      setDomains((prev) => [...prev, tracking_domain].sort((a, b) => a.hostname.localeCompare(b.hostname)));
      setHostname("");
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

      <div className="space-y-3">
        <h2 className="font-semibold">Tracking domains</h2>
        <p className="text-sm text-[var(--velo-muted)]">
          Serve campaign links from your own hostname (only <code>/r</code>, <code>/c</code>,{" "}
          <code>/lp</code> and <code>/click</code>). {setup}
        </p>
        <ul className="space-y-2">
          {domains.length === 0 && (
            <li className="text-sm text-[var(--velo-muted)]">No tracking domains.</li>
          )}
          {domains.map((domain) => (
            <li className="flex items-center justify-between gap-3" key={domain.id}>
              <span className="mono">{domain.hostname}</span>
              {canWrite && (
                <button
                  className="text-sm underline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await automationApi.deleteTrackingDomain(domain.id);
                      setDomains((prev) => prev.filter((d) => d.id !== domain.id));
                    })
                  }
                  type="button"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
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
      </div>
    </div>
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
          </option>
        ))}
      </select>
      <ErrorBox message={error} />
    </label>
  );
}
