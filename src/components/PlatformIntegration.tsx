import { useEffect, useState, type FormEvent } from "react";
import type { Platform, PlatformAction, PlatformResult, PlatformSettings } from "../../shared/platforms";
import { request } from "../lib/api";
import { ErrorBox, Field } from "./ui";

type Operation = { operation_id: string; provider: string; action: string; created_at: number; result: PlatformResult | null };
const errorMessage = (e: unknown) => e instanceof Error ? e.message : "Request failed";
const label = (key: string) => key.replaceAll("_", " ").replace(/^./, (s) => s.toUpperCase());

export function PlatformIntegration({ sourceId, canWrite }: { sourceId: string; canWrite: boolean }) {
  const base = `/api/platforms/sources/${encodeURIComponent(sourceId)}`;
  const [providers, setProviders] = useState<Platform[]>([]);
  const [saved, setSaved] = useState<PlatformSettings | null>(null);
  const [providerId, setProviderId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [allowWrites, setAllowWrites] = useState(false);
  const [credential, setCredential] = useState("");
  const [removeCredential, setRemoveCredential] = useState(false);
  const [actionId, setActionId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [review, setReview] = useState<{ action: PlatformAction; params: Record<string, unknown>; operation_id: string } | null>(null);
  const [result, setResult] = useState<PlatformResult | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const provider = providers.find((p) => p.id === providerId);
  const activeProvider = providers.find((p) => p.id === saved?.provider);
  const action = activeProvider?.actions.find((a) => a.id === actionId);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      request<{ providers: Platform[] }>("/api/platforms"),
      request<{ settings: PlatformSettings }>(base),
      request<{ operations: Operation[] }>(`${base}/operations`),
    ]).then(([catalog, config, log]) => {
      if (cancelled) return;
      setProviders(catalog.providers); setSaved(config.settings); setProviderId(config.settings.provider ?? "");
      setEnabled(config.settings.enabled); setAllowWrites(config.settings.allow_writes); setOperations(log.operations);
    }).catch((e) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [base]);
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!saved) return;
    await run(async () => {
      const response = await request<{ settings: PlatformSettings }>(base, { method: "PUT", body: JSON.stringify({
        provider: providerId, enabled, allow_writes: allowWrites, revision: saved.revision,
        ...(removeCredential ? { credential: null } : credential ? { credential } : {}),
      }) });
      setSaved(response.settings); setCredential(""); setRemoveCredential(false); setReview(null); setActionId(""); setResult(null);
      setNotice("Connection saved. No campaign changes were sent.");
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!action || !saved) return;
    const params: Record<string, unknown> = {};
    try {
      for (const [key, field] of Object.entries(action.input_schema.properties)) {
        const value = values[key];
        if (value === undefined || value === "") continue;
        params[key] = field.type === "array" ? JSON.parse(value) : ["number", "integer"].includes(field.type) ? Number(value) : value;
      }
    } catch { setError("Enter arrays as JSON, for example [\"123\", \"456\"]."); return; }
    if (!action.read_only) { setReview({ action, params, operation_id: crypto.randomUUID() }); setResult(null); return; }
    await run(async () => {
      const response = await request<{ result: PlatformResult }>(`${base}/read`, { method: "POST", body: JSON.stringify({ action: action.id, params, revision: saved.revision }) });
      setResult(response.result);
    });
  }
  async function execute() {
    if (!review || !saved) return;
    await run(async () => {
      let response: { result: PlatformResult };
      try {
        response = await request<{ result: PlatformResult }>(`${base}/execute`, { method: "POST", body: JSON.stringify({ action: review.action.id, params: review.params, operation_id: review.operation_id, revision: saved.revision }) });
      } catch (e) {
        setResult({ provider: saved.provider!, action: review.action.id, status: "unknown", data: null, operation_id: review.operation_id,
          message: "No result was received. Retrying this review reuses the same operation ID; inspect the provider before starting a different change." });
        throw e;
      }
      setResult(response.result); setReview(null);
      setOperations((await request<{ operations: Operation[] }>(`${base}/operations`)).operations);
    });
  }
  const dirty = providerId !== (saved?.provider ?? "") || enabled !== saved?.enabled || allowWrites !== saved?.allow_writes || !!credential || removeCredential;
  return <section className="card p-5 space-y-5" aria-label="Platform management">
    <div>
      <div className="flex items-center gap-2"><h2 className="font-semibold">Platform management</h2><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Beta · opt-in</span></div>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">Inspect and manage your paid traffic from Capve or MCP. Connections and remote changes are disabled by default.</p>
    </div>
    <ErrorBox message={error} />
    {saved && <form onSubmit={save} className="space-y-4">
      <label className="block space-y-2"><span className="text-sm font-medium">Advertising platform</span>
        <select className="input" value={providerId} disabled={!canWrite || busy} required onChange={(e) => { setProviderId(e.target.value); setCredential(""); setEnabled(false); setAllowWrites(false); setRemoveCredential(false); setReview(null); }}>
          <option value="">Choose a platform…</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {provider && <>
        <p className="text-sm text-[var(--velo-muted)]">{provider.setup} <a className="underline" href={provider.documentation_url} target="_blank" rel="noreferrer">Provider documentation</a></p>
        {provider.limitation && <p className="rounded-lg border border-amber-400/40 p-3 text-sm">{provider.limitation}</p>}
        {canWrite && <Field label={provider.credential_label} type="password" autoComplete="new-password" value={credential} disabled={busy || removeCredential} placeholder={saved.has_credential && saved.provider === providerId ? "Credential saved · leave blank to keep it" : "Paste management credential"} onChange={(e) => setCredential(e.target.value)} />}
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} disabled={!canWrite || busy || removeCredential} onChange={(e) => { setEnabled(e.target.checked); if (!e.target.checked) setAllowWrites(false); }} />Enable this beta connection</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={allowWrites} disabled={!canWrite || busy || !enabled || !provider.actions.some((a) => !a.read_only)} onChange={(e) => setAllowWrites(e.target.checked)} />Allow console and MCP to change live campaigns</label>
          {canWrite && saved.has_credential && saved.provider === providerId && <label className="flex items-center gap-2"><input type="checkbox" checked={removeCredential} disabled={busy} onChange={(e) => { setRemoveCredential(e.target.checked); if (e.target.checked) { setEnabled(false); setAllowWrites(false); } }} />Remove saved credential</label>}
        </div>
        {canWrite && <button type="submit" className="btn btn-secondary" disabled={busy || !dirty}>Save connection</button>}
      </>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </form>}
    {saved?.enabled && activeProvider && <div className="border-t border-[var(--velo-line)] pt-4 space-y-4">
      <h3 className="font-medium">{activeProvider.name} campaign controls</h3>
      {dirty && <p className="text-sm">Save connection changes before using campaign controls.</p>}
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-2"><span className="text-sm font-medium">Action</span><select className="input" disabled={busy || dirty || !!review} value={actionId} onChange={(e) => { setActionId(e.target.value); setValues({}); setResult(null); }}>
          <option value="">Choose an action…</option>{activeProvider.actions.map((a) => <option key={a.id} value={a.id} disabled={!a.read_only && (!canWrite || !saved.allow_writes)}>{a.title}{!a.read_only ? " · live change" : ""}</option>)}
        </select></label>
        {action && <>
          <p className="text-sm text-[var(--velo-muted)]">{action.description}</p>
          {Object.entries(action.input_schema.properties).map(([key, field]) => <div key={key} className="space-y-1">
            {field.enum ? <label className="block space-y-2"><span className="text-sm font-medium">{label(key)}</span><select className="input" required={action.input_schema.required.includes(key)} disabled={busy || dirty || !!review} value={values[key] ?? ""} onChange={(e) => setValues({ ...values, [key]: e.target.value })}><option value="">Choose…</option>{field.enum.map((v) => <option key={v}>{v}</option>)}</select></label>
              : <Field label={label(key)} type={["number", "integer"].includes(field.type) ? "number" : "text"} step={field.type === "integer" ? "1" : "any"} min={field.minimum} max={field.maximum} required={action.input_schema.required.includes(key)} disabled={busy || dirty || !!review} value={values[key] ?? ""} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />}
            <p className="text-xs text-[var(--velo-muted)]">{field.description}{field.type === "array" ? ' Enter JSON, e.g. ["123", "456"].' : ""}</p>
          </div>)}
          <button className="btn btn-primary" type="submit" disabled={busy || dirty || !!review}>{action.read_only ? "Load provider data" : "Review change"}</button>
        </>}
      </form>
      {review && <div className="rounded-lg border border-amber-400/50 p-4 space-y-3">
        <h4 className="font-medium">Review live change · {activeProvider.name}</h4>
        <p className="text-sm">{review.action.title}. This changes the advertising platform and can affect spend.</p>
        <dl className="text-sm">{Object.entries(review.params).map(([key, value]) => <div key={key} className="flex gap-3"><dt className="text-[var(--velo-muted)]">{label(key)}</dt><dd className="font-mono break-all">{JSON.stringify(value)}</dd></div>)}</dl>
        <div className="flex gap-2"><button className="btn btn-primary" disabled={busy || dirty} onClick={execute}>Apply on {activeProvider.name}</button><button className="btn btn-secondary" disabled={busy} onClick={() => setReview(null)}>Cancel</button></div>
      </div>}
      {result && <div role="status" className="space-y-2"><p className="text-sm"><strong>{label(result.status)}.</strong> {result.message}</p>{result.status === "unknown" && <p className="text-sm">Check the provider before creating another change. Capve will not resend this operation.</p>}{result.data !== null && <pre className="max-h-80 overflow-auto rounded-lg bg-black/5 p-3 text-xs">{JSON.stringify(result.data, null, 2)}</pre>}</div>}
    </div>}
    {operations.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-medium">Recent platform changes ({operations.length})</summary><div className="mt-3 overflow-auto"><table className="table"><thead><tr><th>Time</th><th>Platform</th><th>Action</th><th>Result</th></tr></thead><tbody>{operations.map((op) => <tr key={op.operation_id}><td>{new Date(op.created_at).toLocaleString()}</td><td>{op.provider}</td><td>{label(op.action)}</td><td>{op.result?.status ?? "Pending / unknown"}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
