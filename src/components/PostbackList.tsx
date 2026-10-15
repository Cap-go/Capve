import { FormEvent, useEffect, useState } from "react";
import { ErrorBox } from "./ui";
import { api, type Postback, type PostbackOwner } from "../lib/api";

export const COMMON_EVENTS = ["registration", "ftd", "deposit", "lead", "sale"];

const MACROS = "{click_id} {external_id} {payout} {status} {event} {currency} {order_id}";

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
  const ownerKey = JSON.stringify(owner);

  useEffect(() => {
    setEditing(null);
    api
      .postbacks(owner)
      .then(({ postbacks: rows }) => setPostbacks(rows))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load postbacks"));
    // owner is compared by value (ownerKey)
  }, [ownerKey]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
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
    return run(async () => {
      await api.deletePostback(postbackId);
      setPostbacks((prev) => prev.filter((row) => row.id !== postbackId));
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--velo-muted)]">{hint}</p>
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
                          Save
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
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">
                      {row.event ? (
                        <span className="mono">{row.event}</span>
                      ) : (
                        <span className="text-[var(--velo-muted)]">All events</span>
                      )}
                    </td>
                    <td className="mono break-all text-xs">{row.url}</td>
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
            placeholder="https://source.com/postback?cid={click_id}&payout={payout}"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button className="btn btn-secondary whitespace-nowrap text-sm" disabled={busy} type="submit">
            Add postback
          </button>
        </form>
      )}
      <p className="text-xs text-[var(--velo-muted)]">
        Macros: <span className="mono">{MACROS}</span>. Leave event empty to fire on every
        conversion.
      </p>
    </div>
  );
}
