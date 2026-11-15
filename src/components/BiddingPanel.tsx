import { useEffect, useState } from "react";
import { BIDDING_DEFAULTS, type BiddingConfig, type BiddingRun } from "../../shared/bidding";
import { request } from "../lib/api";
import { ErrorBox, Field } from "./ui";

type Settings = { config: BiddingConfig; available: boolean; next_run_at: number };
const numericFields = [
  ["window_hours", "Analysis window (hours)", 1, 720],
  ["conversion_lag_hours", "Conversion delay (hours)", 1, 168],
  ["min_clicks", "Minimum clicks per zone", 10, 1000000],
  ["min_spend_cents", "Minimum spend (cents)", 1, 100000000],
  ["min_conversions", "Conversions before increasing", 1, 1000000],
  ["target_roi", "Target ROI (%)", 0, 1000],
  ["max_change_pct", "Maximum bid change (%)", 1, 20],
] as const;

export function BiddingPanel({ campaignId, canWrite }: { campaignId: string; canWrite: boolean }) {
  const base = `/api/bidding/${encodeURIComponent(campaignId)}`;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<BiddingConfig>({ ...BIDDING_DEFAULTS });
  const [run, setRun] = useState<BiddingRun | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    request<Settings>(`${base}/settings`).then(async (s) => {
      if (!active) return;
      setSettings(s); setDraft(s.config);
      if (s.config.enabled) {
        const data = await request<{ run: BiddingRun | null }>(`${base}/recommendations`);
        if (active) setRun(data.run);
      }
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [base]);
  async function act(fn: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }
  async function save(config: BiddingConfig) {
    const updated = await request<Settings>(`${base}/settings`, { method: "PUT", body: JSON.stringify(config) });
    setSettings({ ...settings!, ...updated }); setDraft(updated.config); setRun(null);
    setNotice(config.enabled ? "Beta enabled for this campaign. Run an analysis when ready." : "Beta disabled for this campaign.");
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings?.config);
  const enabled = settings?.config.enabled === true;
  const stale = run !== null && Date.now() - run.created_at > 24 * 3600_000;
  return <section className="card min-w-0 overflow-hidden" aria-label="AI bidding beta">
    <div className="border-b border-[var(--velo-border)] bg-[var(--velo-bg)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><h2 className="text-lg font-semibold">AI bidding assistant</h2><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">BETA</span></div>
          <p className="mt-2 max-w-2xl text-sm text-[var(--velo-muted)]">Find Adcash zones worth scaling back or testing with a higher bid. Review suggestions powered by Cloudflare Workers AI.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm ${enabled ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>{enabled ? "Enabled for this campaign" : "Off by default"}</span>
      </div>
    </div>
    <div className="space-y-5 p-5">
      <ErrorBox message={error} />
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <div className="grid gap-4 text-sm sm:grid-cols-3">
        <div><p className="font-medium">1. Set your rules</p><p className="mt-1 text-[var(--velo-muted)]">Choose a zone token, mature traffic window and limits.</p></div>
        <div><p className="font-medium">2. Review the evidence</p><p className="mt-1 text-[var(--velo-muted)]">The model can hold or soften a rule’s suggested change.</p></div>
        <div><p className="font-medium">3. Apply in Adcash</p><p className="mt-1 text-[var(--velo-muted)]">Export your review. Adcash bids are never changed automatically.</p></div>
      </div>
      {!settings ? <p className="text-sm">Loading settings…</p> : <form onSubmit={(e) => { e.preventDefault(); void act(() => save({ ...draft, enabled: true })); }}>
        <fieldset disabled={!canWrite || busy} className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2"><span className="text-sm font-medium text-[var(--velo-muted)]">Adcash zone parameter</span><select className="input" value={draft.dimension} onChange={(e) => setDraft({ ...draft, dimension: e.target.value })}>
              {Array.from({ length: 10 }, (_, i) => `sub${i + 1}`).map((s) => <option key={s}>{s}</option>)}
            </select></label>
            <label className="space-y-2"><span className="text-sm font-medium text-[var(--velo-muted)]">Confirm spend currency</span><select className="input" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}><option>USD</option><option>EUR</option></select></label>
            {numericFields.map(([key, label, min, max]) => <Field key={key} label={label} type="number" required min={min} max={max} step={1} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })} />)}
          </div>
          <p className="text-xs text-[var(--velo-muted)]">Map Adcash’s [zone] token to the selected parameter in your traffic source. Confirm costs are current and in the selected currency. Aggregate metrics go to Cloudflare; zone names, visitor data and API keys do not.</p>
          {canWrite && <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" type="submit" disabled={enabled && !dirty}>{enabled ? "Save rules" : "Enable beta for this campaign"}</button>
            {enabled && <button className="btn btn-secondary" type="button" onClick={() => void act(() => save({ ...settings.config, enabled: false }))}>Disable beta</button>}
          </div>}
        </fieldset>
      </form>}
      {settings && !settings.available && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Workers AI is not configured on this install. An administrator must add the AI binding before analysis is available.</p>}
      {enabled && <div className="border-t border-[var(--velo-border)] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold">Bid recommendations</h3><p className="mt-1 text-xs text-[var(--velo-muted)]">GLM-4.7-Flash · On demand · At most once every 15 minutes</p></div>
          {canWrite && <button className="btn btn-primary" type="button" disabled={busy || dirty || !settings.available} onClick={() => void act(async () => {
            const data = await request<{ run: BiddingRun }>(`${base}/analyze`, { method: "POST" }); setRun(data.run);
          })}>{busy ? "Working…" : "Analyze zones"}</button>}
        </div>
        {dirty && <p className="mt-3 text-sm">Save your rules before analyzing.</p>}
        {!run ? <p className="mt-4 rounded-md bg-[var(--velo-bg)] p-4 text-sm text-[var(--velo-muted)]">No analysis yet. Suggestions appear here with clicks, spend, revenue and a reason for each zone.</p> : <>
          <p className="mt-4 text-xs text-[var(--velo-muted)]">Click cohort: {new Date(run.result.from).toLocaleString()} – {new Date(run.result.to).toLocaleString()}. Analyzed {new Date(run.created_at).toLocaleString()}. {stale && "Over 24 hours old — rerun before acting."}</p>
          <div className="mt-3 overflow-x-auto"><table className="table"><thead><tr><th>Zone</th><th>Clicks / conversions</th><th>Spend / revenue</th><th>Suggested bid change</th><th>Reason</th></tr></thead><tbody>
            {run.result.decisions.map((d) => <tr key={d.zone}><td className="max-w-48 break-all font-medium">{d.zone}</td><td>{d.clicks} / {d.conversions}</td><td>{(d.cost_cents / 100).toFixed(2)} / {(d.revenue_cents / 100).toFixed(2)} {run.result.config.currency}</td><td className="whitespace-nowrap font-semibold">{d.change_pct === 0 ? "Hold" : `${d.change_pct > 0 ? "+" : ""}${d.change_pct}%`}</td><td className="max-w-sm text-sm">{d.reason}</td></tr>)}
            {!run.result.decisions.length && <tr><td colSpan={5}>No mature, non-bot traffic with a zone token in this window.</td></tr>}
          </tbody></table></div>
          <a className="mt-3 inline-block text-sm underline" href={`${base}/recommendations?format=csv`} download>Export recommendations CSV</a>
        </>}
        <p className="mt-4 text-xs text-[var(--velo-muted)]">Experimental recommendations, not guaranteed gains. Check current bids and budgets in Adcash before making a change. CSV is a review sheet, not an Adcash bulk-import file.</p>
      </div>}
    </div>
  </section>;
}
