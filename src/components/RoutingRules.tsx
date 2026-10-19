import { FormEvent, useEffect, useState } from "react";
import {
  api,
  type FlowType,
  type Lander,
  type Offer,
  type Path,
  type RoutingRule,
  type RuleCondition,
  type RuleOperator,
} from "../lib/api";
import { ErrorBox, Field } from "./ui";

const SELECT =
  "w-full rounded-md border border-[var(--velo-border)] bg-transparent px-3 py-2 text-sm";

const FIELDS: { value: string; label: string; hint: string }[] = [
  { value: "country", label: "Country", hint: "DE, AT, CH" },
  { value: "continent", label: "Continent", hint: "EU, NA, AS (AF, AN, OC, SA)" },
  { value: "region", label: "Region", hint: "BY, NRW" },
  { value: "city", label: "City", hint: "Berlin, Munich" },
  { value: "device_type", label: "Device", hint: "mobile, tablet, desktop" },
  { value: "os", label: "OS", hint: "Android, iOS, Windows" },
  { value: "browser", label: "Browser", hint: "Chrome, Safari" },
  { value: "isp", label: "ISP (contains)", hint: "vodafone, telekom" },
  { value: "asn", label: "ASN", hint: "3320, AS6805" },
  { value: "language", label: "Language", hint: "de, en-us" },
  { value: "connection", label: "Connection", hint: "datacenter, residential" },
  { value: "bot", label: "Bot", hint: "yes, no" },
  { value: "referrer_domain", label: "Referrer domain", hint: "adcash.com" },
  { value: "ip", label: "IP / CIDR", hint: "203.0.113.0/24" },
  { value: "weekday", label: "Day of week", hint: "mon, tue, sat" },
  { value: "hour", label: "Hour", hint: "9-17, 22-3" },
  ...Array.from({ length: 10 }, (_, i) => ({
    value: `sub${i + 1}`,
    label: `sub${i + 1}`,
    hint: "zone ids, comma separated",
  })),
];

const FLOW_TYPES: { value: FlowType; label: string }[] = [
  { value: "direct", label: "Direct URL" },
  { value: "lander", label: "Lander" },
  { value: "offer", label: "Offer" },
  { value: "lander_offer", label: "Lander → Offer" },
];

type ConditionDraft = { field: string; op: RuleOperator; values: string };

function emptyCondition(): ConditionDraft {
  return { field: "country", op: "in", values: "" };
}

function toConditions(drafts: ConditionDraft[]): RuleCondition[] {
  return drafts
    .filter((d) => d.values.trim())
    .map((d) => ({
      field: d.field,
      op: d.op,
      values: d.values
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    }));
}

function describe(condition: RuleCondition): string {
  const label = FIELDS.find((f) => f.value === condition.field)?.label ?? condition.field;
  return `${label} ${condition.op === "in" ? "in" : "not in"} ${condition.values.join(", ")}`;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Binom-style routing rules: first matching rule sends the click to its own paths. */
export function RoutingRules({ programId, canWrite = true }: { programId: string; canWrite?: boolean }) {
  const [rules, setRules] = useState<RoutingRule[] | null>(null);
  const [landers, setLanders] = useState<Lander[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [drafts, setDrafts] = useState<ConditionDraft[]>([emptyCondition()]);

  async function reload() {
    const res = await api.rules(programId);
    setRules(res.rules);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.rules(programId), api.landers(), api.offers()])
      .then(([ruleRes, landerRes, offerRes]) => {
        if (cancelled) return;
        setRules(ruleRes.rules);
        setLanders(landerRes.landers);
        setOffers(offerRes.offers);
      })
      .catch((err) => !cancelled && setError(errorMessage(err, "Failed to load rules")));
    return () => {
      cancelled = true;
    };
  }, [programId]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      await reload();
      return true;
    } catch (err) {
      setError(errorMessage(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addRule(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () => api.createRule(programId, { name, timezone, conditions: toConditions(drafts) }),
      "Could not create rule",
    );
    if (ok) {
      setName("");
      setDrafts([emptyCondition()]);
    }
  }

  function move(rule: RoutingRule, delta: number) {
    if (!rules) return;
    const index = rules.findIndex((r) => r.id === rule.id);
    if (!rules[index + delta]) return;
    const next = [...rules];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    void run(async () => {
      for (const [order, r] of next.entries()) {
        if (r.sort_order !== order) await api.updateRule(programId, r.id, { sort_order: order });
      }
    }, "Could not reorder");
  }

  if (!rules) {
    return <div className="card p-5 text-[var(--velo-muted)]">Loading rules…</div>;
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Rules</h2>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">
        Rules run top to bottom. The first rule whose conditions all match sends the click to its
        own paths; everything else uses the paths above.
      </p>
      <ErrorBox message={error} />

      <div className="mt-4 space-y-4">
        {rules.length === 0 && (
          <p className="text-sm text-[var(--velo-muted)]">No rules — all traffic uses the default paths.</p>
        )}
        {rules.map((rule, index) => (
          <div key={rule.id} className="rounded-md border border-[var(--velo-border)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium">
                  {index + 1}. {rule.name}
                </span>
                {!rule.enabled && <span className="ml-2 text-xs text-[var(--velo-muted)]">disabled</span>}
                <span className="ml-2 text-xs text-[var(--velo-muted)]">{rule.timezone}</span>
              </div>
              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-secondary text-xs" disabled={busy || index === 0} onClick={() => move(rule, -1)} type="button">
                    Up
                  </button>
                  <button
                    className="btn btn-secondary text-xs"
                    disabled={busy || index === rules.length - 1}
                    onClick={() => move(rule, 1)}
                    type="button"
                  >
                    Down
                  </button>
                  <button
                    className="btn btn-secondary text-xs"
                    disabled={busy}
                    onClick={() =>
                      void run(() => api.updateRule(programId, rule.id, { enabled: !rule.enabled }), "Could not update rule")
                    }
                    type="button"
                  >
                    {rule.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="btn btn-secondary text-xs"
                    disabled={busy}
                    onClick={() => void run(() => api.deleteRule(programId, rule.id), "Could not delete rule")}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
            <ul className="mt-2 text-sm text-[var(--velo-muted)]">
              {rule.conditions.length === 0 && <li>Matches all traffic</li>}
              {rule.conditions.map((c, i) => (
                <li key={i} className="mono">
                  {describe(c)}
                </li>
              ))}
            </ul>
            <RulePaths
              paths={rule.paths}
              busy={busy}
              canWrite={canWrite}
              onDelete={(pathId) => void run(() => api.deletePath(programId, pathId), "Could not delete path")}
            />
            {canWrite && (
              <PathForm
                landers={landers}
                offers={offers}
                busy={busy}
                onSubmit={(input) =>
                  run(() => api.createPathWithItems(programId, { ...input, rule_id: rule.id }), "Could not create path")
                }
              />
            )}
          </div>
        ))}
      </div>

      {canWrite && (
        <form className="mt-6 space-y-3" onSubmit={addRule}>
          <h3 className="text-sm font-semibold">Add rule</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rule name" placeholder="DE mobile" value={name} onChange={(e) => setName(e.target.value)} required />
            <Field
              label="Timezone (for day / hour)"
              placeholder="Europe/Berlin"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </div>
          {drafts.map((draft, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[180px_110px_1fr_auto]">
              <select
                className={SELECT}
                value={draft.field}
                onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, field: e.target.value } : d)))}
              >
                {FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                className={SELECT}
                value={draft.op}
                onChange={(e) =>
                  setDrafts(drafts.map((d, j) => (j === i ? { ...d, op: e.target.value as RuleOperator } : d)))
                }
              >
                <option value="in">in</option>
                <option value="not_in">not in</option>
              </select>
              <input
                className="input"
                placeholder={FIELDS.find((f) => f.value === draft.field)?.hint}
                value={draft.values}
                onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, values: e.target.value } : d)))}
              />
              <button
                className="btn btn-secondary text-xs"
                disabled={drafts.length === 1}
                onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button className="btn btn-secondary text-sm" onClick={() => setDrafts([...drafts, emptyCondition()])} type="button">
              Add condition
            </button>
            <button className="btn btn-primary text-sm" disabled={busy} type="submit">
              Add rule
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function RulePaths({
  paths,
  busy,
  canWrite,
  onDelete,
}: {
  paths: Path[];
  busy: boolean;
  canWrite: boolean;
  onDelete: (pathId: string) => void;
}) {
  if (paths.length === 0) {
    return <p className="mt-3 text-sm text-[var(--velo-muted)]">No paths yet — this rule is skipped until you add one.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Path</th>
            <th>Weight</th>
            <th>Landers</th>
            <th>Offers</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {paths.map((path) => (
            <tr key={path.id}>
              <td>
                {path.name} <span className="text-xs text-[var(--velo-muted)]">{path.flow_type}</span>
              </td>
              <td>{path.weight}</td>
              <td className="max-w-xs truncate">
                {path.flow_type === "direct"
                  ? <span className="mono">{path.direct_url}</span>
                  : (path.landers ?? []).map((l) => `${l.name} (${l.weight})`).join(", ") || "—"}
              </td>
              <td className="max-w-xs truncate">
                {(path.offers ?? []).map((o) => `${o.name} (${o.weight})`).join(", ") || "—"}
              </td>
              <td>
                {canWrite && (
                  <button className="btn btn-secondary text-xs" disabled={busy} onClick={() => onDelete(path.id)} type="button">
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type ItemDraft = { id: string; weight: string };

/** Path form with several weighted landers / offers. */
export function PathForm({
  landers,
  offers,
  busy,
  onSubmit,
}: {
  landers: Lander[];
  offers: Offer[];
  busy: boolean;
  onSubmit: (input: {
    name: string;
    flow_type: FlowType;
    weight: number;
    direct_url: string | null;
    landers?: { lander_id: string; weight: number }[];
    offers?: { offer_id: string; weight: number }[];
  }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [flowType, setFlowType] = useState<FlowType>("direct");
  const [directUrl, setDirectUrl] = useState("");
  const [weight, setWeight] = useState("100");
  const [landerItems, setLanderItems] = useState<ItemDraft[]>([{ id: "", weight: "100" }]);
  const [offerItems, setOfferItems] = useState<ItemDraft[]>([{ id: "", weight: "100" }]);

  const usesLanders = flowType === "lander" || flowType === "lander_offer";
  const usesOffers = flowType === "offer" || flowType === "lander_offer";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const items = (list: ItemDraft[]) =>
      list.filter((i) => i.id).map((i) => ({ id: i.id, weight: Number(i.weight) || 100 }));
    const ok = await onSubmit({
      name,
      flow_type: flowType,
      weight: Number(weight) || 100,
      direct_url: flowType === "direct" ? directUrl : null,
      landers: usesLanders ? items(landerItems).map((i) => ({ lander_id: i.id, weight: i.weight })) : undefined,
      offers: usesOffers ? items(offerItems).map((i) => ({ offer_id: i.id, weight: i.weight })) : undefined,
    });
    if (ok) {
      setName("");
      setDirectUrl("");
      setLanderItems([{ id: "", weight: "100" }]);
      setOfferItems([{ id: "", weight: "100" }]);
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-secondary mt-3 text-xs" onClick={() => setOpen(true)} type="button">
        Add path
      </button>
    );
  }

  return (
    <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <Field label="Path name" value={name} onChange={(e) => setName(e.target.value)} required />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Flow type</span>
        <select className={SELECT} value={flowType} onChange={(e) => setFlowType(e.target.value as FlowType)}>
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
          placeholder="https://example.com/?click={click_id}"
          value={directUrl}
          onChange={(e) => setDirectUrl(e.target.value)}
          required
        />
      )}
      {usesLanders && (
        <ItemList label="Landers" options={landers} items={landerItems} onChange={setLanderItems} />
      )}
      {usesOffers && <ItemList label="Offers" options={offers} items={offerItems} onChange={setOfferItems} />}
      <Field label="Path weight" type="number" min={1} value={weight} onChange={(e) => setWeight(e.target.value)} />
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary text-sm" disabled={busy} type="submit">
          Save path
        </button>
        <button className="btn btn-secondary text-sm" onClick={() => setOpen(false)} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Weighted lander / offer picker rows (shared with PathEditor). */
export function ItemList({
  label,
  options,
  items,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
}) {
  return (
    <div className="space-y-2 text-sm sm:col-span-2">
      <span className="block font-medium">{label} (weighted)</span>
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-[1fr_90px_auto] gap-2">
          <select
            className={SELECT}
            value={item.id}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}
            required={i === 0}
          >
            <option value="">Select</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            min={1}
            aria-label="Weight"
            value={item.weight}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))}
          />
          <button
            className="btn btn-secondary text-xs"
            disabled={items.length === 1}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            type="button"
          >
            Remove
          </button>
        </div>
      ))}
      <button className="btn btn-secondary text-xs" onClick={() => onChange([...items, { id: "", weight: "100" }])} type="button">
        Add {label.toLowerCase().slice(0, -1)}
      </button>
    </div>
  );
}
