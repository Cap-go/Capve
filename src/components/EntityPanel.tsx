import { FormEvent, Fragment, useEffect, useState } from "react";
import { ErrorBox, Field } from "../components/ui";
import { PostbackList } from "./PostbackList";
import { NetworkTemplatePicker, SourceSettingsPanel, SourceTemplatePicker } from "./SourceTemplates";
import {
  api,
  formatMoney,
  type AffiliateNetwork,
  type Group,
  type Lander,
  type Offer,
  type TrafficSource,
} from "../lib/api";

type EntityKind = "sources" | "networks" | "offers" | "landers" | "groups";

const POSTBACK_HINTS = {
  sources:
    "Called on approved conversions of campaigns using this source (sampled by its postback %). Add one per event, e.g. registration and FTD pixels.",
  networks:
    "Called on approved conversions of clicks that went to this network's offers. Add one per event, e.g. registration and FTD.",
};

export function EntityPanel({ kind, canWrite = true }: { kind: EntityKind; canWrite?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [costType, setCostType] = useState<"cpc" | "cpm" | "cpa">("cpc");
  const [costCents, setCostCents] = useState("0");
  const [sources, setSources] = useState<TrafficSource[]>([]);
  const [networks, setNetworks] = useState<AffiliateNetwork[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [landers, setLanders] = useState<Lander[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [networkId, setNetworkId] = useState("");
  const [payout, setPayout] = useState("0");
  const [postbackCounts, setPostbackCounts] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  async function reloadPostbackCounts() {
    const { postbacks } = await api.postbacks();
    const counts: Record<string, number> = {};
    for (const pb of postbacks) {
      const owner = pb.traffic_source_id ?? pb.network_id;
      if (owner) counts[owner] = (counts[owner] ?? 0) + 1;
    }
    setPostbackCounts(counts);
  }

  function togglePostbacks(ownerId: string) {
    if (openId === ownerId) reloadPostbackCounts().catch(() => {});
    setOpenId(openId === ownerId ? null : ownerId);
  }

  async function reload() {
    if (kind === "sources") setSources((await api.trafficSources()).traffic_sources);
    if (kind === "networks" || kind === "offers") setNetworks((await api.networks()).networks);
    if (kind === "offers") setOffers((await api.offers()).offers);
    if (kind === "sources" || kind === "networks") await reloadPostbackCounts();
    if (kind === "landers") setLanders((await api.landers()).landers);
    if (kind === "groups") setGroups((await api.groups()).groups);
  }

  useEffect(() => {
    setOpenId(null);
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [kind]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (kind === "sources") {
        await api.createTrafficSource({
          name,
          cost_type: costType,
          default_cost_cents: Math.round(Number(costCents) * 100) || 0,
        });
      } else if (kind === "networks") {
        await api.createNetwork({ name });
      } else if (kind === "offers") {
        await api.createOffer({
          name,
          url,
          network_id: networkId || null,
          payout_cents: Math.round(Number(payout) * 100) || 0,
        });
      } else if (kind === "landers") {
        await api.createLander({ name, url });
      } else {
        await api.createGroup(name);
      }
      setName("");
      setUrl("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create");
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<EntityKind, string> = {
    sources: "Traffic sources",
    networks: "Affiliate networks",
    offers: "Offers",
    landers: "Landers",
    groups: "Groups",
  };

  return (
    <div className="space-y-6">
      {kind === "sources" && canWrite && <SourceTemplatePicker onCreated={() => void reload()} />}
      {kind === "networks" && canWrite && <NetworkTemplatePicker onCreated={() => void reload()} />}
      <div className="card p-5">
        <h2 className="font-semibold">Create {titles[kind].slice(0, -1)}</h2>
        <ErrorBox message={error} />
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          {kind === "sources" && (
            <>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[var(--velo-muted)]">Cost type</span>
                <select
                  className="input"
                  value={costType}
                  onChange={(e) => setCostType(e.target.value as "cpc" | "cpm" | "cpa")}
                >
                  <option value="cpc">CPC</option>
                  <option value="cpm">CPM</option>
                  <option value="cpa">CPA</option>
                </select>
              </label>
              <Field
                label="Default cost (USD)"
                type="number"
                min="0"
                step="0.01"
                value={costCents}
                onChange={(e) => setCostCents(e.target.value)}
              />
            </>
          )}
          {(kind === "offers" || kind === "landers") && (
            <Field
              label="URL"
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          )}
          {kind === "offers" && (
            <>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[var(--velo-muted)]">
                  Affiliate network
                </span>
                <select
                  className="input"
                  value={networkId}
                  onChange={(e) => setNetworkId(e.target.value)}
                >
                  <option value="">None</option>
                  {networks.map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Default payout (USD)"
                type="number"
                min="0"
                step="0.01"
                value={payout}
                onChange={(e) => setPayout(e.target.value)}
              />
            </>
          )}
          {(kind === "sources" || kind === "networks") && (
            <p className="text-sm text-[var(--velo-muted)]">
              Add postbacks (one per event: registration, FTD, ...) from the list below.
            </p>
          )}
          {kind === "offers" && (
            <p className="text-sm text-[var(--velo-muted)]">
              Use <span className="mono">{"{click_id}"}</span> in the offer URL for network macros.
            </p>
          )}
          <button className="btn btn-primary" disabled={busy} type="submit">
            Create
          </button>
        </form>
      </div>

      <div className="card overflow-hidden p-5">
        <h2 className="font-semibold">{titles[kind]}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                {kind === "sources" && (
                  <>
                    <th>Cost</th>
                    <th>Type</th>
                  </>
                )}
                {(kind === "offers" || kind === "landers") && <th>URL</th>}
                {kind === "offers" && (
                  <>
                    <th>Network</th>
                    <th>Payout</th>
                  </>
                )}
                {(kind === "sources" || kind === "networks") && <th>Postbacks</th>}
              </tr>
            </thead>
            <tbody>
              {kind === "sources" &&
                sources.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td>{row.name}</td>
                      <td>{formatMoney(row.default_cost_cents)}</td>
                      <td className="mono">{row.cost_type.toUpperCase()}</td>
                      <td>
                        <PostbackToggle
                          count={postbackCounts[row.id] ?? 0}
                          open={openId === row.id}
                          onClick={() => togglePostbacks(row.id)}
                        />
                      </td>
                    </tr>
                    {openId === row.id && (
                      <tr>
                        <td colSpan={4}>
                          <PostbackList
                            owner={{ traffic_source_id: row.id }}
                            canWrite={canWrite}
                            hint={POSTBACK_HINTS.sources}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              {kind === "networks" &&
                networks.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td>{row.name}</td>
                      <td>
                        <PostbackToggle
                          count={postbackCounts[row.id] ?? 0}
                          open={openId === row.id}
                          onClick={() => togglePostbacks(row.id)}
                        />
                      </td>
                    </tr>
                    {openId === row.id && (
                      <tr>
                        <td colSpan={2}>
                          <PostbackList
                            owner={{ network_id: row.id }}
                            canWrite={canWrite}
                            hint={POSTBACK_HINTS.networks}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              {kind === "offers" &&
                offers.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="mono text-xs">{row.url}</td>
                    <td>{networks.find((n) => n.id === row.network_id)?.name ?? "—"}</td>
                    <td>{formatMoney(row.payout_cents)}</td>
                  </tr>
                ))}
              {kind === "landers" &&
                landers.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="mono text-xs">{row.url}</td>
                  </tr>
                ))}
              {kind === "groups" &&
                groups.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {kind === "sources" && <SourceSettingsPanel sources={sources} canWrite={canWrite} />}
    </div>
  );
}

function PostbackToggle({
  count,
  open,
  onClick,
}: {
  count: number;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button className="underline" onClick={onClick} type="button">
      {open ? "Close" : count === 0 ? "Add postbacks" : `${count} postback${count === 1 ? "" : "s"}`}
    </button>
  );
}
