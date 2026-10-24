import { FormEvent, Fragment, useEffect, useState } from "react";
import { ErrorBox, Field, SavedNote, SelectField, confirmDelete, useSaveState } from "../components/ui";
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
type CostType = "cpc" | "cpm" | "cpa";

const POSTBACK_HINTS = {
  sources:
    "Called on approved conversions of campaigns using this source (sampled by its postback %). Add one per event, e.g. registration and FTD pixels.",
  networks:
    "Called on approved conversions of clicks that went to this network's offers. Add one per event, e.g. registration and FTD.",
};

const TITLES: Record<EntityKind, { list: string; one: string }> = {
  sources: { list: "Traffic sources", one: "traffic source" },
  networks: { list: "Affiliate networks", one: "affiliate network" },
  offers: { list: "Offers", one: "offer" },
  landers: { list: "Landers", one: "lander" },
  groups: { list: "Groups", one: "group" },
};

const COST_OPTIONS = [
  { value: "cpc", label: "CPC" },
  { value: "cpm", label: "CPM" },
  { value: "cpa", label: "CPA" },
];

/** Draft of the fields edited in the create form and the inline edit row. */
type Draft = {
  name: string;
  url: string;
  costType: CostType;
  cost: string;
  postbackPercent: string;
  networkId: string;
  payout: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  url: "",
  costType: "cpc",
  cost: "0",
  postbackPercent: "100",
  networkId: "",
  payout: "0",
};

const toCents = (value: string) => Math.max(0, Math.round(Number(value) * 100) || 0);
const fromCents = (cents: number) => (cents / 100).toFixed(2);

export function EntityPanel({ kind, canWrite = true }: { kind: EntityKind; canWrite?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [sources, setSources] = useState<TrafficSource[]>([]);
  const [networks, setNetworks] = useState<AffiliateNetwork[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [landers, setLanders] = useState<Lander[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [postbackCounts, setPostbackCounts] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const save = useSaveState();

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
    setEditing(null);
    setError("");
    setDraft(EMPTY_DRAFT);
    reload().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [kind]);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    return run(async () => {
      if (kind === "sources") {
        await api.createTrafficSource({
          name: draft.name,
          cost_type: draft.costType,
          default_cost_cents: toCents(draft.cost),
        });
      } else if (kind === "networks") {
        await api.createNetwork({ name: draft.name });
      } else if (kind === "offers") {
        await api.createOffer({
          name: draft.name,
          url: draft.url,
          network_id: draft.networkId || null,
          payout_cents: toCents(draft.payout),
        });
      } else if (kind === "landers") {
        await api.createLander({ name: draft.name, url: draft.url });
      } else {
        await api.createGroup(draft.name);
      }
      setDraft(EMPTY_DRAFT);
      await reload();
    }, "Could not create");
  }

  function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const { id, draft: d } = editing;
    setError("");
    return save
      .run(async () => {
        if (kind === "sources") {
          await api.updateTrafficSource(id, {
            name: d.name,
            cost_type: d.costType,
            default_cost_cents: toCents(d.cost),
            postback_percent: Math.min(100, Math.max(0, Math.round(Number(d.postbackPercent)) || 0)),
          });
        } else if (kind === "networks") {
          await api.updateNetwork(id, { name: d.name });
        } else if (kind === "offers") {
          await api.updateOffer(id, {
            name: d.name,
            url: d.url,
            network_id: d.networkId || null,
            payout_cents: toCents(d.payout),
          });
        } else if (kind === "landers") {
          await api.updateLander(id, { name: d.name, url: d.url });
        }
        setEditing(null);
        await reload();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not save"));
  }

  function onDelete(id: string, name: string) {
    const detail =
      kind === "groups"
        ? "Campaigns in this group are kept and moved out of it."
        : kind === "sources" || kind === "networks"
          ? "Its postbacks are deleted too."
          : undefined;
    if (!confirmDelete(`${TITLES[kind].one} "${name}"`, detail)) return;
    return run(async () => {
      if (kind === "sources") await api.deleteTrafficSource(id);
      else if (kind === "networks") await api.deleteNetwork(id);
      else if (kind === "offers") await api.deleteOffer(id);
      else if (kind === "landers") await api.deleteLander(id);
      else await api.deleteGroup(id);
      if (openId === id) setOpenId(null);
      await reload();
    }, "Could not delete");
  }

  function startEdit(id: string, d: Partial<Draft>) {
    setError("");
    setEditing({ id, draft: { ...EMPTY_DRAFT, ...d } });
  }

  const networkOptions = [
    { value: "", label: "None" },
    ...networks.map((network) => ({ value: network.id, label: network.name })),
  ];

  const columns =
    1 +
    (kind === "sources" ? 4 : 0) +
    (kind === "networks" ? 1 : 0) +
    (kind === "offers" ? 3 : 0) +
    (kind === "landers" ? 1 : 0) +
    (canWrite ? 1 : 0);

  const rowCount = {
    sources: sources.length,
    networks: networks.length,
    offers: offers.length,
    landers: landers.length,
    groups: groups.length,
  }[kind];

  const actions = (id: string, name: string, edit?: () => void) =>
    canWrite ? (
      <td className="whitespace-nowrap text-right text-sm">
        {edit && (
          <button className="underline" disabled={busy} onClick={edit} type="button">
            Edit
          </button>
        )}
        <button
          className="ml-3 underline"
          disabled={busy}
          onClick={() => onDelete(id, name)}
          type="button"
        >
          Delete
        </button>
      </td>
    ) : null;

  const editRow = (id: string) =>
    editing?.id === id ? (
      <tr>
        <td colSpan={columns}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSaveEdit}>
            <DraftFields
              draft={editing.draft}
              kind={kind}
              networkOptions={networkOptions}
              onChange={(next) => setEditing({ id, draft: next })}
              withPostbackPercent
            />
            <div className="flex items-center gap-3 sm:col-span-2">
              <button className="btn btn-primary text-sm" disabled={save.saving} type="submit">
                {save.saving ? "Saving…" : "Save"}
              </button>
              <button className="btn btn-ghost text-sm" onClick={() => setEditing(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </td>
      </tr>
    ) : null;

  return (
    <div className="space-y-6">
      {kind === "sources" && canWrite && <SourceTemplatePicker onCreated={() => void reload()} />}
      {kind === "networks" && canWrite && <NetworkTemplatePicker onCreated={() => void reload()} />}
      <ErrorBox message={error} />
      {canWrite && (
        <div className="card p-5">
          <h2 className="font-semibold">New {TITLES[kind].one}</h2>
          <form className="mt-4 space-y-3" onSubmit={onCreate}>
            <DraftFields draft={draft} kind={kind} networkOptions={networkOptions} onChange={setDraft} />
            {(kind === "sources" || kind === "networks") && (
              <p className="text-sm text-[var(--velo-muted)]">
                Add postbacks (one per event: registration, FTD, ...) from the list below.
              </p>
            )}
            {kind === "offers" && (
              <p className="text-sm text-[var(--velo-muted)]">
                Paste the network link as is. Put <span className="mono">{"{click_id}"}</span> in its sub
                ID field, e.g. <span className="mono">{"?subid1={click_id}"}</span>. A pasted source click
                macro (<span className="mono">[clickid]</span>) works too: Capve fills it with the same
                click id. The source macro on the campaign link is separate.{" "}
                <a className="underline" href="/docs/networks" target="_blank" rel="noreferrer">
                  Example
                </a>
              </p>
            )}
            {kind === "landers" && (
              <p className="text-sm text-[var(--velo-muted)]">
                Link the lander's call-to-action to <span className="mono">{"{lp_click_url}"}</span>{" "}
                (or <span className="mono">{"/lp/{click_id}"}</span>) to track LP clicks.
              </p>
            )}
            <div className="flex items-center gap-3">
              <button className="btn btn-primary" disabled={busy} type="submit">
                {busy ? "Creating…" : `Create ${TITLES[kind].one}`}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden p-5">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">{TITLES[kind].list}</h2>
          <SavedNote show={save.saved} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                {kind === "sources" && (
                  <>
                    <th>Cost</th>
                    <th>Type</th>
                    <th>Postback %</th>
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
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {rowCount === 0 && (
                <tr>
                  <td colSpan={columns} className="text-[var(--velo-muted)]">
                    No {TITLES[kind].list.toLowerCase()} yet.
                    {canWrite ? " Create one above." : ""}
                  </td>
                </tr>
              )}
              {kind === "sources" &&
                sources.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td>{row.name}</td>
                      <td>{formatMoney(row.default_cost_cents)}</td>
                      <td className="mono">{row.cost_type.toUpperCase()}</td>
                      <td>{row.postback_percent}%</td>
                      <td>
                        <PostbackToggle
                          count={postbackCounts[row.id] ?? 0}
                          open={openId === row.id}
                          onClick={() => togglePostbacks(row.id)}
                        />
                      </td>
                      {actions(row.id, row.name, () =>
                        startEdit(row.id, {
                          name: row.name,
                          costType: row.cost_type,
                          cost: fromCents(row.default_cost_cents),
                          postbackPercent: String(row.postback_percent),
                        }),
                      )}
                    </tr>
                    {editRow(row.id)}
                    {openId === row.id && (
                      <tr>
                        <td colSpan={columns}>
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
                      {actions(row.id, row.name, () => startEdit(row.id, { name: row.name }))}
                    </tr>
                    {editRow(row.id)}
                    {openId === row.id && (
                      <tr>
                        <td colSpan={columns}>
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
                  <Fragment key={row.id}>
                    <tr>
                      <td>{row.name}</td>
                      <td className="mono break-all text-xs">{row.url}</td>
                      <td>{networks.find((n) => n.id === row.network_id)?.name ?? "—"}</td>
                      <td>{formatMoney(row.payout_cents)}</td>
                      {actions(row.id, row.name, () =>
                        startEdit(row.id, {
                          name: row.name,
                          url: row.url,
                          networkId: row.network_id ?? "",
                          payout: fromCents(row.payout_cents),
                        }),
                      )}
                    </tr>
                    {editRow(row.id)}
                  </Fragment>
                ))}
              {kind === "landers" &&
                landers.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td>{row.name}</td>
                      <td className="mono break-all text-xs">{row.url}</td>
                      {actions(row.id, row.name, () =>
                        startEdit(row.id, { name: row.name, url: row.url }),
                      )}
                    </tr>
                    {editRow(row.id)}
                  </Fragment>
                ))}
              {kind === "groups" &&
                groups.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    {actions(row.id, row.name)}
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

function DraftFields({
  kind,
  draft,
  onChange,
  networkOptions,
  withPostbackPercent = false,
}: {
  kind: EntityKind;
  draft: Draft;
  onChange: (draft: Draft) => void;
  networkOptions: Array<{ value: string; label: string }>;
  withPostbackPercent?: boolean;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <>
      <Field label="Name" value={draft.name} onChange={(e) => set({ name: e.target.value })} required />
      {kind === "sources" && (
        <>
          <SelectField
            label="Cost type"
            value={draft.costType}
            onChange={(v) => set({ costType: v as CostType })}
            options={COST_OPTIONS}
          />
          <Field
            label="Default cost (USD)"
            type="number"
            min="0"
            step="0.01"
            value={draft.cost}
            onChange={(e) => set({ cost: e.target.value })}
          />
          {withPostbackPercent && (
            <Field
              label="Postback % (share of conversions reported)"
              type="number"
              min="0"
              max="100"
              value={draft.postbackPercent}
              onChange={(e) => set({ postbackPercent: e.target.value })}
            />
          )}
        </>
      )}
      {(kind === "offers" || kind === "landers") && (
        <Field
          label="URL"
          type="url"
          placeholder={kind === "offers" ? "https://network.example/abc123?subid1={click_id}" : "https://..."}
          value={draft.url}
          onChange={(e) => set({ url: e.target.value })}
          required
        />
      )}
      {kind === "offers" && (
        <>
          <SelectField
            label="Affiliate network"
            value={draft.networkId}
            onChange={(v) => set({ networkId: v })}
            options={networkOptions}
          />
          <Field
            label="Default payout (USD)"
            type="number"
            min="0"
            step="0.01"
            value={draft.payout}
            onChange={(e) => set({ payout: e.target.value })}
          />
        </>
      )}
    </>
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
