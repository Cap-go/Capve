import { useEffect, useState } from "react";
import { ErrorBox } from "./ui";
import { api, formatMoney, type PlatformOverview, type PlatformUserRow } from "../lib/api";

export function AdminPanel() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [users, setUsers] = useState<PlatformUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.adminOverview(), api.adminUsers()])
      .then(([overviewRes, usersRes]) => {
        setOverview(overviewRes.overview);
        setUsers(usersRes.users);
        setTotal(usersRes.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load admin data"));
  }, []);

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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
