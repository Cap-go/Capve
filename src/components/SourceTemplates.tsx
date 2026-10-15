import { FormEvent, useEffect, useState } from "react";
import { CodeBlock } from "./CodeBlock";
import { ErrorBox, Field } from "./ui";
import { formatMoney, type TrafficSource } from "../lib/api";
import {
  sourcesApi,
  TOKEN_SLOTS,
  type CostUpdate,
  type NetworkTemplate,
  type SourceLink,
  type SourceSettings,
  type SourceTemplate,
  type SourceToken,
  type TokenSlot,
} from "../lib/sources-api";

function message(err: unknown) {
  return err instanceof Error ? err.message : "Request failed";
}

/** "Create from template" for traffic sources (Adcash, PropellerAds, ...). */
export function SourceTemplatePicker({ onCreated }: { onCreated: () => void }) {
  const [templates, setTemplates] = useState<SourceTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");

  useEffect(() => {
    sourcesApi
      .templates()
      .then((data) => setTemplates(data.traffic_sources))
      .catch((err) => setError(message(err)));
  }, []);

  const template = templates.find((t) => t.id === templateId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!template) return;
    setBusy(true);
    setError("");
    try {
      const { traffic_source, postback } = await sourcesApi.createSourceFromTemplate(
        template.id,
        name.trim() || undefined,
      );
      setCreated(
        `${traffic_source.name} created${postback ? " with its postback (replace placeholders like YOUR_KEY)" : ""}.`,
      );
      setName("");
      onCreated();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Create from template</h2>
      <ErrorBox message={error} />
      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--velo-muted)]">Template</span>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Choose a traffic source…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.verified ? "" : " (check macros)"}
              </option>
            ))}
          </select>
        </label>
        {template && (
          <div className="space-y-2 text-sm">
            <p className="text-[var(--velo-muted)]">
              {template.cost_type.toUpperCase()} · tokens:{" "}
              <span className="mono">
                {template.tokens.map((t) => `${t.param}→${t.slot} (${t.name})`).join(", ")}
              </span>
            </p>
            {template.postback_url && <CodeBlock>{template.postback_url}</CodeBlock>}
            {template.notes && <p className="text-[var(--velo-muted)]">{template.notes}</p>}
            {!template.verified && (
              <p className="text-[var(--velo-muted)]">
                Macro names could not be verified: compare them with the source's tracking settings
                and edit the tokens after creating.
              </p>
            )}
          </div>
        )}
        <Field label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !template} type="submit">
          Create from template
        </button>
        {created && <p className="text-sm">{created}</p>}
      </form>
    </div>
  );
}

/** "Create from template" for affiliate networks: shows the incoming postback with their macros. */
export function NetworkTemplatePicker({ onCreated }: { onCreated: () => void }) {
  const [templates, setTemplates] = useState<NetworkTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    sourcesApi
      .templates()
      .then((data) => setTemplates(data.networks))
      .catch((err) => setError(message(err)));
  }, []);

  const template = templates.find((t) => t.id === templateId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!template) return;
    setBusy(true);
    setError("");
    try {
      await sourcesApi.createNetworkFromTemplate(template.id, name.trim() || undefined);
      setName("");
      onCreated();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Create from template</h2>
      <ErrorBox message={error} />
      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--velo-muted)]">Network platform</span>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Choose a platform…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.verified ? "" : " (check macros)"}
              </option>
            ))}
          </select>
        </label>
        {template && (
          <div className="space-y-2 text-sm">
            <p className="text-[var(--velo-muted)]">
              Add <span className="mono">{template.offer_url_suffix}</span> to the offer URL, then
              paste these postbacks in the network (one per event):
            </p>
            <CodeBlock>
              {`${template.incoming_postback_urls.default}\n${template.incoming_postback_urls.registration}\n${template.incoming_postback_urls.ftd}`}
            </CodeBlock>
            {template.notes && <p className="text-[var(--velo-muted)]">{template.notes}</p>}
          </div>
        )}
        <Field label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !template} type="submit">
          Create from template
        </button>
      </form>
    </div>
  );
}

const EMPTY_TOKEN: SourceToken = { param: "", name: "", slot: "sub1" };

/** Named tokens and cost API of one traffic source. */
export function SourceSettingsPanel({
  sources,
  canWrite,
}: {
  sources: TrafficSource[];
  canWrite: boolean;
}) {
  const [sourceId, setSourceId] = useState("");
  const [settings, setSettings] = useState<SourceSettings | null>(null);
  const [tokens, setTokens] = useState<SourceToken[]>([]);
  const [apiProvider, setApiProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    sourcesApi.templates().then((data) => setProviders(data.cost_providers)).catch(() => {});
  }, []);

  useEffect(() => {
    setSettings(null);
    setNotice("");
    if (!sourceId) return;
    sourcesApi
      .settings(sourceId)
      .then(({ settings: s }) => {
        setSettings(s);
        setTokens(s.tokens);
        setApiProvider(s.api_provider ?? "");
        setApiKey("");
      })
      .catch((err) => setError(message(err)));
  }, [sourceId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  function updateToken(index: number, patch: Partial<SourceToken>) {
    setTokens((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { settings: s } = await sourcesApi.updateSettings(sourceId, {
        tokens: tokens.filter((t) => t.param.trim()),
        api_provider: apiProvider || null,
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      setSettings(s);
      setTokens(s.tokens);
      setApiKey("");
      setNotice("Saved.");
    });
  };

  const onSync = () =>
    run(async () => {
      const { result } = await sourcesApi.syncCost(sourceId);
      setNotice(
        `Synced ${formatMoney(result.total_cents)} onto ${result.clicks_updated} clicks (${result.updates} updates).`,
      );
      setSettings((await sourcesApi.settings(sourceId)).settings);
    });

  if (sources.length === 0) return null;

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Tokens & cost API</h2>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">
        Map the source's URL params to subs (shown by name in reports) and pull spend from its API.
      </p>
      <ErrorBox message={error} />
      <label className="mt-4 block space-y-2">
        <span className="text-sm font-medium text-[var(--velo-muted)]">Traffic source</span>
        <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="">Choose…</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {settings && (
        <form className="mt-4 space-y-4" onSubmit={onSave}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Param</th>
                  <th>Name</th>
                  <th>Stored in</th>
                  <th>Source macro</th>
                  <th>Role</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tokens.map((token, i) => (
                  <tr key={i}>
                    <td>
                      <input className="input mono" value={token.param} disabled={!canWrite}
                        onChange={(e) => updateToken(i, { param: e.target.value })} />
                    </td>
                    <td>
                      <input className="input" value={token.name} disabled={!canWrite}
                        onChange={(e) => updateToken(i, { name: e.target.value })} />
                    </td>
                    <td>
                      <select className="input" value={token.slot} disabled={!canWrite}
                        onChange={(e) => updateToken(i, { slot: e.target.value as TokenSlot })}>
                        {TOKEN_SLOTS.map((slot) => (
                          <option key={slot} value={slot}>{slot}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input mono" value={token.macro ?? ""} disabled={!canWrite}
                        onChange={(e) => updateToken(i, { macro: e.target.value || undefined })} />
                    </td>
                    <td>
                      <select className="input" value={token.kind ?? ""} disabled={!canWrite}
                        onChange={(e) =>
                          updateToken(i, { kind: (e.target.value || undefined) as SourceToken["kind"] })
                        }>
                        <option value="">—</option>
                        <option value="campaign">Source campaign id</option>
                        <option value="zone">Zone id</option>
                      </select>
                    </td>
                    <td>
                      {canWrite && (
                        <button className="underline" type="button"
                          onClick={() => setTokens((prev) => prev.filter((_, j) => j !== i))}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canWrite && (
            <button className="underline text-sm" type="button"
              onClick={() => setTokens((prev) => [...prev, { ...EMPTY_TOKEN }])}>
              Add token
            </button>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--velo-muted)]">Cost API</span>
              <select className="input" value={apiProvider} disabled={!canWrite}
                onChange={(e) => setApiProvider(e.target.value)}>
                <option value="">None</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <Field
              label={settings.has_api_key ? "API key (stored — leave empty to keep)" : "API key"}
              type="password"
              autoComplete="off"
              value={apiKey}
              disabled={!canWrite}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          {settings.last_sync_at && (
            <p className="text-sm text-[var(--velo-muted)]">
              Last sync {new Date(settings.last_sync_at).toLocaleString()}
              {settings.last_sync_error ? ` — error: ${settings.last_sync_error}` : " — ok"}
            </p>
          )}
          {notice && <p className="text-sm">{notice}</p>}
          {canWrite && (
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" disabled={busy} type="submit">Save</button>
              <button className="btn btn-secondary" disabled={busy || !settings.api_provider || !settings.has_api_key}
                type="button" onClick={onSync}>
                Sync cost now
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Campaign view: link with the source's macros, and manual cost updates. */
export function CampaignSourcePanel({ programId, canWrite }: { programId: string; canWrite: boolean }) {
  const [link, setLink] = useState<SourceLink | null>(null);
  const [updates, setUpdates] = useState<CostUpdate[]>([]);
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [total, setTotal] = useState("");
  const [filterDim, setFilterDim] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    const [l, u] = await Promise.all([
      sourcesApi.sourceLink(programId),
      sourcesApi.costUpdates(programId),
    ]);
    setLink(l);
    setUpdates(u.cost_updates);
  }

  useEffect(() => {
    setError("");
    reload().catch((err) => setError(message(err)));
  }, [programId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await sourcesApi.updateCost(programId, {
        from,
        to,
        total_cents: Math.round(Number(total) * 100),
        ...(filterDim && filterValue.trim() ? { filter_dim: filterDim, filter_value: filterValue.trim() } : {}),
      });
      setTotal("");
      await reload();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const filterOptions = [
    ...(link?.tokens ?? [])
      .filter((t) => t.slot !== "cost")
      .map((t) => ({ value: t.param, label: `${t.name} (${t.param})` })),
    ...Array.from({ length: 10 }, (_, i) => ({ value: `sub${i + 1}`, label: `sub${i + 1}` })),
    { value: "country", label: "Country" },
  ];

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Traffic source link & cost</h2>
      <ErrorBox message={error} />
      {link?.tracking_url && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-[var(--velo-muted)]">
            Paste in your traffic source (its macros are filled per click):
          </p>
          <CodeBlock>{link.tracking_url}</CodeBlock>
        </div>
      )}
      {link && !link.traffic_source_id && (
        <p className="mt-4 text-sm text-[var(--velo-muted)]">
          Set a traffic source with tokens on this campaign to get a link with its macros.
        </p>
      )}

      {canWrite && (
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <p className="text-sm text-[var(--velo-muted)]">
            Update cost: the total is spread evenly over matching clicks and replaces their cost.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
            <Field label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
            <Field label="Total cost (USD)" type="number" min="0" step="0.01" value={total}
              onChange={(e) => setTotal(e.target.value)} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--velo-muted)]">Only clicks where</span>
              <select className="input" value={filterDim} onChange={(e) => setFilterDim(e.target.value)}>
                <option value="">All clicks</option>
                {filterOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <Field label="equals" value={filterValue} disabled={!filterDim}
              onChange={(e) => setFilterValue(e.target.value)} />
          </div>
          <button className="btn btn-secondary" disabled={busy} type="submit">Update cost</button>
        </form>
      )}

      {updates.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Range</th>
                <th>Filter</th>
                <th>Total</th>
                <th>Clicks</th>
                <th>Origin</th>
              </tr>
            </thead>
            <tbody>
              {updates.map((u) => (
                <tr key={u.id}>
                  <td className="mono text-xs">
                    {new Date(u.from_ms).toISOString().slice(0, 10)} →{" "}
                    {new Date(u.to_ms).toISOString().slice(0, 10)}
                  </td>
                  <td className="mono text-xs">
                    {u.filter_dim ? `${u.filter_dim}=${u.filter_value}` : "all"}
                  </td>
                  <td>{formatMoney(u.total_cents)}</td>
                  <td>{u.clicks_updated}</td>
                  <td>{u.origin === "api" ? "API sync" : "Manual"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
