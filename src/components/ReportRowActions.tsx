import { useEffect, useState, type ReactNode } from "react";
import { api, formatMoney, type GroupedReportRow, type Path } from "../lib/api";
import { automationApi, type ZoneBlacklistEntry } from "../lib/api-automation";
import { sourcesApi } from "../lib/sources-api";

/** Dimensions a cost update can target (matches the worker's COST_FILTER_DIMS). */
const COST_DIMS = new Set([...Array.from({ length: 10 }, (_, i) => `sub${i + 1}`), "country", "external_id"]);
/** Source zones you would paste into a traffic source's blacklist. */
const ZONE_DIMS = new Set([...Array.from({ length: 10 }, (_, i) => `sub${i + 1}`), "external_id"]);

type Options = {
  campaignId: string;
  groupBy: string;
  from?: number;
  to?: number;
  /** Reload the report after a change. */
  onChanged: () => void;
  onError: (message: string) => void;
};

/**
 * Binom-style actions on a breakdown row: pause/resume a path, set the cost of a zone or
 * country for the selected period, and add a zone to the campaign blacklist.
 */
export function useReportRowActions({ campaignId, groupBy, from, to, onChanged, onError }: Options) {
  const [paths, setPaths] = useState<Path[]>([]);
  const [blacklist, setBlacklist] = useState<ZoneBlacklistEntry[]>([]);
  const [costKey, setCostKey] = useState<string | null>(null);
  const [costValue, setCostValue] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setCostKey(null);
    if (!campaignId || groupBy !== "path") return setPaths([]);
    let cancelled = false;
    api
      .rotation(campaignId)
      .then(({ paths: pool, rules }) => {
        if (!cancelled) setPaths([...pool, ...(rules ?? []).flatMap((rule) => rule.paths)]);
      })
      .catch(() => !cancelled && setPaths([]));
    return () => {
      cancelled = true;
    };
  }, [campaignId, groupBy, version]);

  useEffect(() => {
    if (!campaignId || !ZONE_DIMS.has(groupBy)) return setBlacklist([]);
    let cancelled = false;
    automationApi
      .blacklist(campaignId)
      .then(({ blacklist: entries }) => !cancelled && setBlacklist(entries))
      .catch(() => !cancelled && setBlacklist([]));
    return () => {
      cancelled = true;
    };
  }, [campaignId, groupBy, version]);

  const hasActions = groupBy === "path" || COST_DIMS.has(groupBy);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusyKey(key);
    onError("");
    try {
      await action();
      setVersion((v) => v + 1);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyKey(null);
    }
  }

  function saveCost(key: string) {
    const total = Number(costValue.replace(",", "."));
    if (!Number.isFinite(total) || total < 0) return onError("Enter a cost of 0 or more");
    return run(key, async () => {
      await sourcesApi.updateCost(campaignId, {
        // "All time" has no range: cover every click up to now.
        from: from ?? 0,
        to: to ?? Date.now(),
        total_cents: Math.round(total * 100),
        filter_dim: groupBy,
        filter_value: key,
      });
      setCostKey(null);
    });
  }

  function render(row: GroupedReportRow): ReactNode {
    const key = row.key;
    if (key == null) return null;
    const busy = busyKey === key;
    if (groupBy === "path") {
      const path = paths.find((p) => p.id === key);
      if (!path) return null;
      return (
        <button
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => run(key, () => api.updatePath(campaignId, key, { enabled: !path.enabled }))}
          type="button"
        >
          {path.enabled ? "Pause path" : "Resume path"}
        </button>
      );
    }
    if (!COST_DIMS.has(groupBy)) return null;
    if (costKey === key) {
      return (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void saveCost(key);
          }}
        >
          <input
            aria-label={`Total cost for ${row.label}`}
            autoFocus
            className="input input-sm"
            inputMode="decimal"
            onChange={(e) => setCostValue(e.target.value)}
            placeholder="Total"
            value={costValue}
          />
          <button className="btn btn-primary btn-sm" disabled={busy} type="submit">
            Save
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setCostKey(null)} type="button">
            Cancel
          </button>
        </form>
      );
    }
    const blocked = blacklist.some((entry) => entry.dimension === groupBy && entry.value === key);
    return (
      <div className="flex items-center gap-1">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setCostKey(key);
            setCostValue((row.metrics.cost_cents / 100).toFixed(2));
          }}
          title={`Spread a total cost over this row's clicks in the selected period (now ${formatMoney(row.metrics.cost_cents, row.currency)})`}
          type="button"
        >
          Set cost
        </button>
        {ZONE_DIMS.has(groupBy) &&
          (blocked ? (
            <span className="px-2 py-1 text-xs text-[var(--velo-muted)]">Blacklisted</span>
          ) : (
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => run(key, () => automationApi.addToBlacklist(campaignId, groupBy, [key]))}
              type="button"
            >
              Blacklist
            </button>
          ))}
      </div>
    );
  }

  return { hasActions, render, pathEnabled: (id: string) => paths.find((p) => p.id === id)?.enabled };
}
