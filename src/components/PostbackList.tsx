import { FormEvent, Fragment, useEffect, useState } from "react";
import { ErrorBox, SavedNote, confirmDelete, useSaveState } from "./ui";
import { api, type Postback, type PostbackDelivery, type PostbackOwner } from "../lib/api";

export const COMMON_EVENTS = ["registration", "ftd", "deposit", "lead", "sale"];

const MACROS = "{click_id} {external_id} {payout} {status} {event} {currency} {order_id}";
const SOURCE_MACROS = "{external_id} {payout} {status} {event} {currency} {order_id}";

/** Last delivery attempts of one postback (status code or error). */
function DeliveryLog({ postbackId }: { postbackId: string }) {
  const [deliveries, setDeliveries] = useState<PostbackDelivery[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .postbackDeliveries(postbackId)
      .then(({ deliveries: rows }) => setDeliveries(rows))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load deliveries"));
  }, [postbackId]);

  if (error) return <p className="text-xs text-red-700">{error}</p>;
  if (!deliveries) return <p className="text-xs text-[var(--velo-muted)]">Loading…</p>;
  if (deliveries.length === 0) {
    return <p className="text-xs text-[var(--velo-muted)]">No deliveries yet.</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {deliveries.map((d) => (
        <li key={d.id} className="flex flex-wrap gap-x-3">
          <span className="whitespace-nowrap text-[var(--velo-muted)]">
            {new Date(d.created_at).toLocaleString()}
          </span>
          <span className={`mono whitespace-nowrap ${d.ok ? "" : "text-red-700"}`}>
            {d.ok ? `OK ${d.status_code}` : (d.error ?? `HTTP ${d.status_code}`)}
            {d.attempt > 1 ? " (retry)" : ""}
          </span>
          <span className="mono break-all text-[var(--velo-muted)]">{d.url}</span>
        </li>
      ))}
    </ul>
  );
}

/** Outgoing postbacks of one campaign, traffic source or network: list, add, edit, delete. */
export function PostbackList({
  owner,
  canWrite,
  hint,
}: {
  owner: PostbackOwner;
  canWrite: boolean;
  hint: string;
}) {
  const [postbacks, setPostbacks] = useState<Postback[]>([]);
  const [event, setEvent] = useState("");
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState<{ id: string; event: string; url: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const save = useSaveState();
  const ownerKey = JSON.stringify(owner);

  useEffect(() => {
    setEditing(null);
    api
      .postbacks(owner)
      .then(({ postbacks: rows }) => setPostbacks(rows))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load postbacks"));
    // owner is compared by value (ownerKey)
  }, [ownerKey]);

  async function run(action: () => Promise<void>, flashSaved = true) {
    setBusy(true);
    setError("");
    try {
      await (flashSaved ? save.run(action) : action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    return run(async () => {
      const { postback } = await api.createPostback(owner, { event: event.trim() || null, url });
      setPostbacks((prev) => [...prev, postback]);
      setEvent("");
      setUrl("");
    });
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    return run(async () => {
      const { postback } = await api.updatePostback(editing.id, {
        event: editing.event.trim() || null,
        url: editing.url,
      });
      setPostbacks((prev) => prev.map((row) => (row.id === postback.id ? postback : row)));
      setEditing(null);
    });
  }

  function onDelete(postbackId: string) {
    if (!confirmDelete("this postback")) return;
    return run(async () => {
      await api.deletePostback(postbackId);
      setPostbacks((prev) => prev.filter((row) => row.id !== postbackId));
    }, false);
  }

  const forSource = "traffic_source_id" in owner;
  const urlPlaceholder = forSource
    ? "https://source.example/postback?cid={external_id}&value={payout}"
    : "https://source.com/postback?cid={click_id}&payout={payout}";

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--velo-muted)]">{hint}</p>
      {forSource ? (
        <p className="text-sm text-[var(--velo-muted)]">
          Adcash pixel: <span className="mono">cid={"{external_id}"}</span>. That is Adcash's click
          id, and it is the value Adcash matches. <span className="mono">cid={"{click_id}"}</span>{" "}
          sends Capve's <span className="mono">clk_…</span> id, so the conversion does not show in
          Adcash. <span className="mono">{"{click_id}"}</span> belongs on the offer URL.
        </p>
      ) : null}
      <ErrorBox message={error} />
      <datalist id="postback-events">
        {COMMON_EVENTS.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {postbacks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>URL</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {postbacks.map((row) =>
                editing?.id === row.id ? (
                  <tr key={row.id}>
                    <td colSpan={canWrite ? 3 : 2}>
                      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onSave}>
                        <input
                          className="input sm:w-44! sm:shrink-0"
                          list="postback-events"
                          placeholder="All events"
                          value={editing.event}
                          onChange={(e) => setEditing({ ...editing, event: e.target.value })}
                        />
                        <input
                          className="input mono text-xs"
                          type="url"
                          required
                          value={editing.url}
                          onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                        />
                        <button className="btn btn-primary text-sm" disabled={busy} type="submit">
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button
                          className="btn btn-ghost text-sm"
                          onClick={() => setEditing(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <Fragment key={row.id}>
                    <tr>
                      <td className="whitespace-nowrap">
                        {row.event ? (
                          <span className="mono">{row.event}</span>
                        ) : (
                          <span className="text-[var(--velo-muted)]">All events</span>
                        )}
                      </td>
                      <td className="mono break-all text-xs">
                        {row.url}
                        <button
                          className="ml-2 font-sans underline text-[var(--velo-muted)]"
                          onClick={() => setOpenLog(openLog === row.id ? null : row.id)}
                          type="button"
                        >
                          {openLog === row.id ? "Hide deliveries" : "Last deliveries"}
                        </button>
                      </td>
                      {canWrite && (
                        <td className="whitespace-nowrap text-right text-sm">
                          <button
                            className="underline"
                            onClick={() =>
                              setEditing({ id: row.id, event: row.event ?? "", url: row.url })
                            }
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="ml-3 underline"
                            disabled={busy}
                            onClick={() => onDelete(row.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                    {openLog === row.id && (
                      <tr>
                        <td colSpan={canWrite ? 3 : 2}>
                          <DeliveryLog postbackId={row.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {canWrite && (
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onAdd}>
          <input
            aria-label="Event"
            className="input sm:w-44! sm:shrink-0"
            list="postback-events"
            placeholder="All events"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
          />
          <input
            aria-label="Postback URL"
            className="input mono text-xs"
            type="url"
            placeholder={urlPlaceholder}
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button className="btn btn-secondary whitespace-nowrap text-sm" disabled={busy} type="submit">
            {busy ? "Saving…" : "Add postback"}
          </button>
        </form>
      )}
      <SavedNote show={save.saved} />
      <p className="text-xs text-[var(--velo-muted)]">
        Macros: <span className="mono">{forSource ? SOURCE_MACROS : MACROS}</span>. Leave event empty to fire on every
        conversion. <span className="mono">{"{status}"}</span> is the conversion status:{" "}
        <span className="mono">lead</span> unless the incoming postback sent{" "}
        <span className="mono">cnv_status</span>.
      </p>
    </div>
  );
}
