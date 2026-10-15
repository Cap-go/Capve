import { FormEvent, useEffect, useState } from "react";
import {
  api,
  type FlowType,
  type Lander,
  type Offer,
  type Path,
  type RotationConfig,
  type RotationMode,
} from "../lib/api";
import { ErrorBox, Field, SavedNote, SelectField, confirmDelete, useSaveState } from "./ui";

const ROTATION_MODES: { value: RotationMode; label: string }[] = [
  { value: "normal", label: "Normal (weighted)" },
  { value: "smart", label: "Smart (sticky visitor)" },
  { value: "fix_on", label: "Fix-on (pinned path)" },
  { value: "top_to_bottom", label: "Top to bottom" },
];

const FLOW_TYPES: { value: FlowType; label: string }[] = [
  { value: "direct", label: "Direct URL" },
  { value: "lander", label: "Lander" },
  { value: "offer", label: "Offer" },
  { value: "lander_offer", label: "Lander → Offer" },
];

const flowLabel = (flow: FlowType) => FLOW_TYPES.find((f) => f.value === flow)?.label ?? flow;

type PathDraft = {
  weight: string;
  direct_url: string;
  lander_id: string;
  offer_id: string;
  enabled: boolean;
};

/** Paths and rotation of one campaign. `trackingOrigin` builds the lander CTA link (/lp/{click_id}). */
export function PathEditor({
  programId,
  trackingOrigin,
  canWrite = true,
}: {
  programId: string;
  trackingOrigin: string;
  canWrite?: boolean;
}) {
  const [config, setConfig] = useState<RotationConfig | null>(null);
  const [landers, setLanders] = useState<Lander[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pathName, setPathName] = useState("");
  const [flowType, setFlowType] = useState<FlowType>("direct");
  const [directUrl, setDirectUrl] = useState("");
  const [landerId, setLanderId] = useState("");
  const [offerId, setOfferId] = useState("");
  const [weight, setWeight] = useState("100");
  const [editing, setEditing] = useState<{ id: string; draft: PathDraft } | null>(null);
  const save = useSaveState();

  useEffect(() => {
    let cancelled = false;
    setConfig(null);
    setError("");
    setEditing(null);
    Promise.all([api.rotation(programId), api.landers(), api.offers()])
      .then(([rotation, landerRes, offerRes]) => {
        if (!cancelled) {
          setConfig(rotation);
          setLanders(landerRes.landers);
          setOffers(offerRes.offers);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load paths");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  async function saveMode(mode: RotationMode) {
    setBusy(true);
    setError("");
    try {
      const next = await api.updateRotation(programId, { mode });
      setConfig(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update rotation");
    } finally {
      setBusy(false);
    }
  }

  async function pinPath(pathId: string) {
    setBusy(true);
    setError("");
    try {
      const next = await api.updateRotation(programId, {
        mode: "fix_on",
        fixed_path_id: pathId,
      });
      setConfig(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pin path");
    } finally {
      setBusy(false);
    }
  }

  async function addPath(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { path } = await api.createPath(programId, {
        name: pathName,
        flow_type: flowType,
        weight: Number(weight) || 100,
        direct_url: flowType === "direct" ? directUrl : null,
        lander_id:
          flowType === "lander" || flowType === "lander_offer" ? landerId || null : null,
        offer_id: flowType === "offer" || flowType === "lander_offer" ? offerId || null : null,
      });
      setConfig((prev) =>
        prev ? { ...prev, paths: [...prev.paths, path] } : { rotation: config!.rotation, paths: [path] },
      );
      setPathName("");
      setDirectUrl("");
      setLanderId("");
      setOfferId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create path");
    } finally {
      setBusy(false);
    }
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const path = config?.paths.find((p) => p.id === editing.id);
    if (!path) return;
    const { draft } = editing;
    setError("");
    return save
      .run(async () => {
        const { path: updated } = await api.updatePath(programId, path.id, {
          weight: Math.max(1, Math.round(Number(draft.weight)) || 1),
          enabled: draft.enabled,
          ...(path.flow_type === "direct" ? { direct_url: draft.direct_url } : {}),
          ...(path.flow_type === "lander" || path.flow_type === "lander_offer"
            ? { lander_id: draft.lander_id || null }
            : {}),
          ...(path.flow_type === "offer" || path.flow_type === "lander_offer"
            ? { offer_id: draft.offer_id || null }
            : {}),
        });
        setConfig((prev) =>
          prev ? { ...prev, paths: prev.paths.map((p) => (p.id === updated.id ? updated : p)) } : prev,
        );
        setEditing(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not save path"));
  }

  async function removePath(pathId: string, name: string) {
    if (!confirmDelete(`path "${name}"`)) return;
    setBusy(true);
    setError("");
    try {
      await api.deletePath(programId, pathId);
      setConfig((prev) =>
        prev ? { ...prev, paths: prev.paths.filter((p) => p.id !== pathId) } : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete path");
    } finally {
      setBusy(false);
    }
  }

  if (!config) {
    return (
      <div className="card p-5 text-[var(--velo-muted)]">
        {error ? <ErrorBox message={`Could not load paths: ${error}`} /> : "Loading paths…"}
      </div>
    );
  }

  const hasPinned = Boolean(
    config.rotation.fixed_path_id && config.paths.some((p) => p.id === config.rotation.fixed_path_id),
  );

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">Paths & rotation</h2>
        <SavedNote show={save.saved} />
      </div>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">
        Route traffic through landers and offers. When no paths exist, clicks use the destination URL.
      </p>

      <ErrorBox message={error} />

      <div className="mt-4 flex flex-wrap gap-2">
        {ROTATION_MODES.map(({ value, label }) => {
          const needsPin = value === "fix_on" && !hasPinned;
          return (
            <button
              key={value}
              className={`btn text-sm ${config.rotation.mode === value ? "btn-primary" : "btn-secondary"}`}
              disabled={busy || !canWrite || needsPin}
              onClick={() => saveMode(value)}
              title={needsPin ? "Pin a path first" : undefined}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>
      {!hasPinned && (
        <p className="mt-2 text-xs text-[var(--velo-muted)]">
          Fix-on sends all traffic to one path: use Pin on a path to enable it.
        </p>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Flow</th>
              <th>Weight</th>
              <th>Destination</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {config.paths.length === 0 && (
              <tr>
                <td colSpan={5} className="text-[var(--velo-muted)]">
                  No paths — add one below.
                </td>
              </tr>
            )}
            {config.paths.map((path) =>
              editing?.id === path.id ? (
                <tr key={path.id}>
                  <td colSpan={5}>
                    <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveEdit}>
                      <p className="text-sm font-medium sm:col-span-2">
                        {path.name}{" "}
                        <span className="text-[var(--velo-muted)]">· {flowLabel(path.flow_type)}</span>
                      </p>
                      <Field
                        label="Weight"
                        type="number"
                        min={1}
                        value={editing.draft.weight}
                        onChange={(e) =>
                          setEditing({ ...editing, draft: { ...editing.draft, weight: e.target.value } })
                        }
                      />
                      {path.flow_type === "direct" && (
                        <Field
                          label="Direct URL"
                          type="url"
                          required
                          value={editing.draft.direct_url}
                          onChange={(e) =>
                            setEditing({ ...editing, draft: { ...editing.draft, direct_url: e.target.value } })
                          }
                        />
                      )}
                      {(path.flow_type === "lander" || path.flow_type === "lander_offer") && (
                        <SelectField
                          label="Lander"
                          value={editing.draft.lander_id}
                          onChange={(v) => setEditing({ ...editing, draft: { ...editing.draft, lander_id: v } })}
                          options={[
                            { value: "", label: "Select lander" },
                            ...landers.map((l) => ({ value: l.id, label: l.name })),
                          ]}
                        />
                      )}
                      {(path.flow_type === "offer" || path.flow_type === "lander_offer") && (
                        <SelectField
                          label="Offer"
                          value={editing.draft.offer_id}
                          onChange={(v) => setEditing({ ...editing, draft: { ...editing.draft, offer_id: v } })}
                          options={[
                            { value: "", label: "Select offer" },
                            ...offers.map((o) => ({ value: o.id, label: o.name })),
                          ]}
                        />
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          checked={editing.draft.enabled}
                          onChange={(e) =>
                            setEditing({ ...editing, draft: { ...editing.draft, enabled: e.target.checked } })
                          }
                          type="checkbox"
                        />
                        Receives traffic
                      </label>
                      <div className="flex items-center gap-3 sm:col-span-2">
                        <button className="btn btn-primary text-sm" disabled={save.saving} type="submit">
                          {save.saving ? "Saving…" : "Save path"}
                        </button>
                        <button className="btn btn-ghost text-sm" onClick={() => setEditing(null)} type="button">
                          Cancel
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <PathRow
                  key={path.id}
                  path={path}
                  pinned={config.rotation.fixed_path_id === path.id}
                  busy={busy}
                  canWrite={canWrite}
                  trackingOrigin={trackingOrigin}
                  onEdit={() =>
                    setEditing({
                      id: path.id,
                      draft: {
                        weight: String(path.weight),
                        direct_url: path.direct_url ?? "",
                        lander_id: path.lander_id ?? "",
                        offer_id: path.offer_id ?? "",
                        enabled: path.enabled,
                      },
                    })
                  }
                  onPin={() => pinPath(path.id)}
                  onDelete={() => removePath(path.id, path.name)}
                />
              ),
            )}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={addPath}>
          <Field
            label="Path name"
            placeholder="Main lander"
            value={pathName}
            onChange={(e) => setPathName(e.target.value)}
            required
          />
          <SelectField
            label="Flow type"
            value={flowType}
            onChange={(v) => setFlowType(v as FlowType)}
            options={FLOW_TYPES}
          />
          {flowType === "direct" && (
            <Field
              label="Direct URL"
              type="url"
              placeholder="https://example.com/lp?click={click_id}"
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              required
            />
          )}
          {(flowType === "lander" || flowType === "lander_offer") && (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--velo-muted)]">Lander</span>
              <select className="input" value={landerId} onChange={(e) => setLanderId(e.target.value)} required>
                <option value="">Select lander</option>
                {landers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(flowType === "offer" || flowType === "lander_offer") && (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[var(--velo-muted)]">Offer</span>
              <select className="input" value={offerId} onChange={(e) => setOfferId(e.target.value)} required>
                <option value="">Select offer</option>
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Field label="Weight" type="number" min={1} value={weight} onChange={(e) => setWeight(e.target.value)} />
          <div className="sm:col-span-2">
            <button className="btn btn-primary" disabled={busy} type="submit">
              Add path
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function PathRow({
  path,
  pinned,
  busy,
  canWrite,
  trackingOrigin,
  onEdit,
  onPin,
  onDelete,
}: {
  path: Path;
  pinned: boolean;
  busy: boolean;
  canWrite: boolean;
  trackingOrigin: string;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const hasLander = path.flow_type === "lander" || path.flow_type === "lander_offer";
  const target =
    path.flow_type === "direct"
      ? path.direct_url
      : path.flow_type === "offer"
        ? (path.offer_name ?? path.offer_url)
        : path.flow_type === "lander"
          ? (path.lander_name ?? path.lander_url)
          : `${path.lander_name ?? path.lander_url ?? "?"} → ${path.offer_name ?? path.offer_url ?? "?"}`;

  return (
    <tr className={path.enabled ? undefined : "opacity-60"}>
      <td>
        {path.name}
        {pinned && <span className="ml-2 text-xs font-medium">pinned</span>}
        {!path.enabled && <span className="ml-2 text-xs text-[var(--velo-muted)]">disabled</span>}
      </td>
      <td className="whitespace-nowrap">{flowLabel(path.flow_type)}</td>
      <td>{path.weight}</td>
      <td className="min-w-48">
        <div className="mono break-all text-xs">{target ?? "—"}</div>
        {hasLander && (
          <div className="mt-1 text-xs text-[var(--velo-muted)]">
            Lander CTA link: <span className="mono break-all">{`${trackingOrigin}/lp/{click_id}`}</span> or
            macro <span className="mono">{"{lp_click_url}"}</span>
          </div>
        )}
      </td>
      <td className="space-x-2 whitespace-nowrap">
        {canWrite && (
          <>
            <button className="btn btn-secondary text-xs" disabled={busy} onClick={onEdit} type="button">
              Edit
            </button>
            <button
              className="btn btn-secondary text-xs"
              disabled={busy || pinned}
              onClick={onPin}
              type="button"
            >
              {pinned ? "Pinned" : "Pin"}
            </button>
            <button className="btn btn-secondary text-xs" disabled={busy} onClick={onDelete} type="button">
              Delete
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
