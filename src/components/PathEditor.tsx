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
import { ErrorBox, Field } from "./ui";

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

export function PathEditor({ programId }: { programId: string }) {
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

  useEffect(() => {
    let cancelled = false;
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

  async function removePath(pathId: string) {
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
    return <div className="card p-5 text-[var(--velo-muted)]">Loading paths…</div>;
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Paths & rotation</h2>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">
        Route traffic through landers and offers. When no paths exist, clicks use the destination URL.
      </p>

      <ErrorBox message={error} />

      <div className="mt-4 flex flex-wrap gap-2">
        {ROTATION_MODES.map(({ value, label }) => (
          <button
            key={value}
            className={`btn text-sm ${config.rotation.mode === value ? "btn-primary" : "btn-secondary"}`}
            disabled={busy}
            onClick={() => saveMode(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

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
            {config.paths.map((path) => (
              <PathRow
                key={path.id}
                path={path}
                pinned={config.rotation.fixed_path_id === path.id}
                busy={busy}
                onPin={() => pinPath(path.id)}
                onDelete={() => removePath(path.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={addPath}>
        <Field
          label="Path name"
          placeholder="Main lander"
          value={pathName}
          onChange={(e) => setPathName(e.target.value)}
          required
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Flow type</span>
          <select
            className="w-full rounded-md border border-[var(--velo-border)] bg-transparent px-3 py-2"
            value={flowType}
            onChange={(e) => setFlowType(e.target.value as FlowType)}
          >
            {FLOW_TYPES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
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
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Lander</span>
            <select
              className="w-full rounded-md border border-[var(--velo-border)] bg-transparent px-3 py-2"
              value={landerId}
              onChange={(e) => setLanderId(e.target.value)}
              required
            >
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
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Offer</span>
            <select
              className="w-full rounded-md border border-[var(--velo-border)] bg-transparent px-3 py-2"
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
              required
            >
              <option value="">Select offer</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Field
          label="Weight"
          type="number"
          min={1}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
        <div className="sm:col-span-2">
          <button className="btn btn-primary" disabled={busy} type="submit">
            Add path
          </button>
        </div>
      </form>
    </div>
  );
}

function PathRow({
  path,
  pinned,
  busy,
  onPin,
  onDelete,
}: {
  path: Path;
  pinned: boolean;
  busy: boolean;
  onPin: () => void;
  onDelete: () => void;
}) {
  const dest =
    path.flow_type === "direct"
      ? path.direct_url
      : path.flow_type === "offer"
        ? path.offer_url
        : path.lander_url;

  return (
    <tr>
      <td>
        {path.name}
        {pinned && <span className="ml-2 text-xs text-[var(--velo-accent)]">pinned</span>}
      </td>
      <td>{path.flow_type}</td>
      <td>{path.weight}</td>
      <td className="mono max-w-xs truncate">{dest ?? "—"}</td>
      <td className="space-x-2 whitespace-nowrap">
        <button className="btn btn-secondary text-xs" disabled={busy} onClick={onPin} type="button">
          Pin
        </button>
        <button className="btn btn-secondary text-xs" disabled={busy} onClick={onDelete} type="button">
          Delete
        </button>
      </td>
    </tr>
  );
}
