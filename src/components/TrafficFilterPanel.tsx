import { FormEvent, useEffect, useState } from "react";
import { api, type BlocklistEntry, type BlocklistKind, type TrafficFilter } from "../lib/api";
import { ErrorBox, Field } from "./ui";

const KINDS: { value: BlocklistKind; label: string; hint: string }[] = [
  { value: "ip", label: "IP / CIDR", hint: "203.0.113.0/24, 198.51.100.7" },
  { value: "asn", label: "ASN", hint: "16509, AS14061" },
  { value: "ua", label: "User agent contains", hint: "HeadlessChrome" },
];

/** Campaign bot handling (safe page / route) + the account-wide blocklist. */
export function TrafficFilterPanel({ programId, canWrite = true }: { programId: string; canWrite?: boolean }) {
  const [filter, setFilter] = useState<TrafficFilter | null>(null);
  const [entries, setEntries] = useState<BlocklistEntry[]>([]);
  const [safePage, setSafePage] = useState("");
  const [kind, setKind] = useState<BlocklistKind>("ip");
  const [values, setValues] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.trafficFilter(programId), api.blocklist()])
      .then(([filterRes, blockRes]) => {
        if (cancelled) return;
        setFilter(filterRes.filter);
        setSafePage(filterRes.filter.safe_page_url ?? "");
        setEntries(blockRes.entries);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load"));
    return () => {
      cancelled = true;
    };
  }, [programId]);

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

  function save(update: Partial<Omit<TrafficFilter, "program_id">>) {
    void run(async () => {
      const res = await api.updateTrafficFilter(programId, update);
      setFilter(res.filter);
    }, "Could not save");
  }

  function addEntries(e: FormEvent) {
    e.preventDefault();
    const list = values
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    void run(async () => {
      const res = await api.addToBlocklist(kind, list);
      setEntries(res.entries);
      setValues("");
    }, "Could not add");
  }

  if (!filter) {
    return <div className="card p-5 text-[var(--velo-muted)]">Loading bot filter…</div>;
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Bots & blocklist</h2>
      <p className="mt-1 text-sm text-[var(--velo-muted)]">
        Bots (user agent / Cloudflare), blocklisted IPs, ASNs and user agents, and — when enabled —
        datacenter traffic are recorded as bot clicks.
      </p>
      <ErrorBox message={error} />

      <div className="mt-4 space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`bot-action-${programId}`}
            checked={filter.bot_action === "route"}
            disabled={!canWrite || busy}
            onChange={() => save({ bot_action: "route" })}
          />
          Count as bot and route normally
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`bot-action-${programId}`}
            checked={filter.bot_action === "safe_page"}
            disabled={!canWrite || busy || !safePage.trim()}
            onChange={() => save({ bot_action: "safe_page", safe_page_url: safePage })}
          />
          Send to safe page
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field
              label="Safe page URL"
              type="url"
              placeholder="https://example.com/blog"
              value={safePage}
              disabled={!canWrite}
              onChange={(e) => setSafePage(e.target.value)}
            />
          </div>
          {canWrite && (
            <button
              className="btn btn-secondary text-sm"
              disabled={busy}
              onClick={() => save({ safe_page_url: safePage.trim() || null })}
              type="button"
            >
              Save URL
            </button>
          )}
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filter.block_datacenter}
            disabled={!canWrite || busy}
            onChange={(e) => save({ block_datacenter: e.target.checked })}
          />
          Treat datacenter / cloud ASNs (AWS, Google Cloud, Azure, OVH, Hetzner…) as bots
        </label>
      </div>

      <h3 className="mt-6 text-sm font-semibold">Account blocklist</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="table">
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td className="text-[var(--velo-muted)]">Empty.</td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{KINDS.find((k) => k.value === entry.kind)?.label}</td>
                <td className="mono">{entry.value}</td>
                <td>
                  {canWrite && (
                    <button
                      className="btn btn-secondary text-xs"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api.removeFromBlocklist(entry.id);
                          setEntries((prev) => prev.filter((e) => e.id !== entry.id));
                        }, "Could not remove")
                      }
                      type="button"
                    >
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
        <form className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]" onSubmit={addEntries}>
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as BlocklistKind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder={KINDS.find((k) => k.value === kind)?.hint}
            value={values}
            onChange={(e) => setValues(e.target.value)}
          />
          <button className="btn btn-primary text-sm" disabled={busy} type="submit">
            Block
          </button>
        </form>
      )}
    </div>
  );
}
