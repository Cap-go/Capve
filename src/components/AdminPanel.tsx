import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { ErrorBox } from "./ui";
import { api, formatMoney, type PlatformOverview, type PlatformUserRow } from "../lib/api";

export function AdminPanel() {
  const { user: actor } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [users, setUsers] = useState<PlatformUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.adminOverview(), api.adminUsers(50, offset)])
      .then(([overviewRes, usersRes]) => {
        if (cancelled) return;
        setOverview(overviewRes.overview);
        setUsers(usersRes.users);
        setTotal(usersRes.total);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load admin data"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [offset]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Platform admin</h2>
        <p className="mt-2 text-[var(--velo-muted)]">Cross-tenant stats and user accounts.</p>
      </div>

      <ErrorBox message={error} />

      {overview ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Users", value: overview.users },
            { label: "Campaigns", value: overview.programs },
            { label: "Affiliates", value: overview.affiliates },
            { label: "Clicks", value: overview.clicks },
            { label: "Conversions", value: overview.conversions },
            { label: "Revenue", value: formatMoney(overview.revenue_cents) },
          ].map((item) => (
            <article key={item.label} className="card p-5">
              <p className="text-sm text-[var(--velo-muted)]">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold">{item.value}</p>
            </article>
          ))}
        </div>
      ) : null}

      <div className="card overflow-x-auto p-0">
        <div className="border-b border-[var(--velo-border)] px-5 py-4">
          <h3 className="font-semibold">Users ({total})</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--velo-accent-soft)] text-[var(--velo-muted)]">
            <tr>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Campaigns</th>
              <th className="px-5 py-3 font-medium">Admin</th>
              <th className="px-5 py-3 font-medium">Joined</th>
              <th className="px-5 py-3 font-medium">Support access</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-[var(--velo-border)]">
                <td className="px-5 py-3">{user.email}</td>
                <td className="px-5 py-3">{user.name || "—"}</td>
                <td className="px-5 py-3">{user.program_count}</td>
                <td className="px-5 py-3">{user.is_platform_admin ? "Yes" : "—"}</td>
                <td className="px-5 py-3">{new Date(user.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3"><button className="btn btn-secondary" type="button" disabled={loading || busyId !== null || user.id === actor?.id} onClick={async () => {
                  setBusyId(user.id);
                  setError("");
                  try { await api.impersonate(user.id); window.location.assign("/app"); }
                  catch (err) { setError(err instanceof Error ? err.message : "Could not impersonate account"); setBusyId(null); }
                }}>{busyId === user.id ? "Opening…" : "Impersonate"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between gap-3 border-t border-[var(--velo-border)] p-4">
          <button className="btn btn-secondary" type="button" disabled={loading || offset === 0 || busyId !== null} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
          <p className="text-sm text-[var(--velo-muted)]">{total ? `${offset + 1}–${Math.min(offset + 50, total)} of ${total}` : "No accounts"}</p>
          <button className="btn btn-secondary" type="button" disabled={loading || offset + 50 >= total || busyId !== null} onClick={() => setOffset(offset + 50)}>Next</button>
        </div>
      </div>
    </div>
  );
}
