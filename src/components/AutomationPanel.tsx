import { FormEvent, useEffect, useState } from "react";
import { formatMoney } from "../lib/api";
import {
  automationApi,
  type AutomationRule,
  type NewAutomationRule,
  type ZoneBlacklistEntry,
} from "../lib/api-automation";
import { Field, ErrorBox } from "./ui";

const ZONE_DIMENSIONS = [
  ...Array.from({ length: 10 }, (_, i) => `sub${i + 1}`),
  "isp",
  "country",
  "referrer_domain",
  "os",
  "browser",
  "device_type",
  "offer",
  "lander",
];

function describe(rule: AutomationRule): string {
  if (rule.kind === "zone_blacklist") {
    return `${rule.dimension}: >= ${rule.min_clicks} clicks and 0 ${rule.event ?? "conversions"} in ${rule.window_hours}h → blacklist`;
  }
  const parts = [
    rule.roi_below != null ? `ROI < ${rule.roi_below}%` : null,
    rule.spend_above_cents != null ? `spend > ${formatMoney(rule.spend_above_cents)}` : null,
  ].filter(Boolean);
  return `${parts.join(" and ")} in ${rule.window_hours}h → alert`;
}

/** Per-campaign zone blacklist rules, ROI/spend alerts and the blacklisted zones. */
export function AutomationPanel({ campaignId, canWrite }: { campaignId: string; canWrite: boolean }) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [blacklist, setBlacklist] = useState<ZoneBlacklistEntry[]>([]);
  const [kind, setKind] = useState<AutomationRule["kind"]>("zone_blacklist");
  const [dimension, setDimension] = useState("sub1");
  const [minClicks, setMinClicks] = useState("300");
  const [event, setEvent] = useState("ftd");
  const [roiBelow, setRoiBelow] = useState("-50");
  const [spendAbove, setSpendAbove] = useState("");
  const [windowHours, setWindowHours] = useState("24");
  const [email, setEmail] = useState("");
  const [webhook, setWebhook] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [r, b] = await Promise.all([
      automationApi.rules(campaignId),
      automationApi.blacklist(campaignId),
    ]);
    setRules(r.rules);
    setBlacklist(b.blacklist);
  }

  useEffect(() => {
    setNotice("");
    reload().catch((err) => setError(err instanceof Error ? err.message : "Failed to load rules"));
  }, [campaignId]);

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

  function onCreate(e: FormEvent) {
    e.preventDefault();
    return run(async () => {
      const rule: NewAutomationRule = {
        campaign_id: campaignId,
        kind,
        window_hours: Number(windowHours),
        notify_email: email.trim() || undefined,
        webhook_url: webhook.trim() || undefined,
      };
      if (kind === "zone_blacklist") {
        rule.dimension = dimension;
        rule.min_clicks = Number(minClicks);
        rule.event = event.trim() || null;
      } else {
        rule.roi_below = roiBelow.trim() === "" ? null : Number(roiBelow);
        rule.spend_above_cents = spendAbove.trim() === "" ? null : Math.round(Number(spendAbove) * 100);
      }
      await automationApi.createRule(rule);
      await reload();
    });
  }

  const values = [...new Set(blacklist.map((entry) => entry.value))];

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Automation</h2>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">
        Checked every 15 minutes. Zone rules blacklist zones that burn clicks without converting;
        alerts notify you by email or webhook when ROI or spend crosses a limit.
      </p>
      <div className="mt-3">
        <ErrorBox message={error} />
      </div>
      {notice && <p className="mt-3 text-sm">{notice}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Notify</th>
              <th>Last fired</th>
              {canWrite && <th />}
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr>
                <td className="text-[var(--velo-muted)]" colSpan={4}>
                  No rules yet.
                </td>
              </tr>
            )}
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>
                  <div className="font-medium">{rule.name}</div>
                  <div className="text-xs text-[var(--velo-muted)]">{describe(rule)}</div>
                </td>
                <td className="text-xs">
                  {[rule.notify_email, rule.webhook_url ? "webhook" : null].filter(Boolean).join(", ") ||
                    "—"}
                </td>
                <td className="text-xs">
                  {rule.last_fired_at ? new Date(rule.last_fired_at).toLocaleString() : "—"}
                </td>
                {canWrite && (
                  <td className="whitespace-nowrap text-sm">
                    <button
                      className="underline"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await automationApi.setRuleEnabled(rule.id, !rule.enabled);
                          await reload();
                        })
                      }
                      type="button"
                    >
                      {rule.enabled ? "Disable" : "Enable"}
                    </button>{" "}
                    <button
                      className="underline"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const { result } = await automationApi.runRule(rule.id);
                          setNotice(result.message ?? "Rule checked: nothing to do.");
                          await reload();
                        })
                      }
                      type="button"
                    >
                      Run now
                    </button>{" "}
                    <button
                      className="underline"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await automationApi.deleteRule(rule.id);
                          await reload();
                        })
                      }
                      type="button"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={onCreate}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--velo-muted)]">Rule type</span>
            <select
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value as AutomationRule["kind"])}
            >
              <option value="zone_blacklist">Blacklist zones</option>
              <option value="alert">ROI / spend alert</option>
            </select>
          </label>
          {kind === "zone_blacklist" ? (
            <>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[var(--velo-muted)]">Zone parameter</span>
                <select className="input" value={dimension} onChange={(e) => setDimension(e.target.value)}>
                  {ZONE_DIMENSIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Min clicks"
                min={1}
                required
                type="number"
                value={minClicks}
                onChange={(e) => setMinClicks(e.target.value)}
              />
              <Field
                label="Goal event (empty = any conversion)"
                placeholder="ftd"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
              />
            </>
          ) : (
            <>
              <Field
                label="ROI below (%)"
                type="number"
                value={roiBelow}
                onChange={(e) => setRoiBelow(e.target.value)}
              />
              <Field
                label="Spend above (USD)"
                min={0}
                step="0.01"
                type="number"
                value={spendAbove}
                onChange={(e) => setSpendAbove(e.target.value)}
              />
            </>
          )}
          <Field
            label="Window (hours)"
            max={720}
            min={1}
            required
            type="number"
            value={windowHours}
            onChange={(e) => setWindowHours(e.target.value)}
          />
          <Field
            label="Email"
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Webhook URL"
            placeholder="https://…"
            type="url"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
          />
          <div className="sm:col-span-3">
            <button className="btn btn-primary" disabled={busy} type="submit">
              Add rule
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Blacklisted zones ({values.length})</h3>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-secondary text-sm"
            disabled={values.length === 0}
            onClick={() =>
              navigator.clipboard
                .writeText(values.join("\n"))
                .then(() => setNotice(`Copied ${values.length} zone(s). Paste them into your traffic source blacklist.`))
                .catch(() => setError("Copy failed"))
            }
            type="button"
          >
            Copy list
          </button>
          <a className="btn btn-secondary text-sm" href={automationApi.blacklistExportUrl(campaignId, "txt")}>
            TXT
          </a>
          <a className="btn btn-secondary text-sm" href={automationApi.blacklistExportUrl(campaignId, "csv")}>
            CSV
          </a>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Zone</th>
              <th>Parameter</th>
              <th>Reason</th>
              <th>Added</th>
              {canWrite && <th />}
            </tr>
          </thead>
          <tbody>
            {blacklist.length === 0 && (
              <tr>
                <td className="text-[var(--velo-muted)]" colSpan={5}>
                  No blacklisted zones.
                </td>
              </tr>
            )}
            {blacklist.map((entry) => (
              <tr key={entry.id}>
                <td className="mono">{entry.value}</td>
                <td className="mono">{entry.dimension}</td>
                <td className="text-xs">{entry.reason ?? "—"}</td>
                <td className="text-xs">{new Date(entry.created_at).toLocaleString()}</td>
                {canWrite && (
                  <td>
                    <button
                      className="text-sm underline"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await automationApi.removeFromBlacklist(entry.id);
                          await reload();
                        })
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
