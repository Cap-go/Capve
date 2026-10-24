import type { AuditEntry } from "../types-ops";
import { id } from "./utils";

const SKIPPED = [
  /^\/api\/auth\/(register|login|forgot-password|reset-password|verify-email|resend-verification|switch-account|impersonate|stop-impersonation)$/,
  /^\/api\/ops\/invites\//,
  /^\/api\/ops\/team(\/|$)/,
  /^\/api\/v1\//,
  /^\/api\/health$/,
];

type Actor = {
  id: string;
  email: string;
  account_id: string;
  impersonating: boolean;
};

/** Human label for a successful dashboard change. Null means "do not record". */
export function describeMutation(method: string, pathname: string): string | null {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return null;
  const path = pathname.replace(/\/+$/, "") || "/";
  if (SKIPPED.some((pattern) => pattern.test(path))) return null;
  const normalized = path.replace(/^\/api\/campaigns(?=\/|$)/, "/api/programs");
  const label = labelFor(verb, normalized);
  if (!label) return null;
  const target = lastId(normalized);
  return target ? `${label} (${target})` : label;
}

export async function recordAudit(
  db: D1Database,
  input: { accountId: string; actorUserId: string; actorEmail: string; action: string },
): Promise<void> {
  try {
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO audit_log (id, account_id, actor_user_id, actor_email, action, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id("log"),
        input.accountId,
        input.actorUserId,
        input.actorEmail,
        input.action.slice(0, 240),
        now,
      )
      .run();
    await db
      .prepare(
        `DELETE FROM audit_log
         WHERE account_id = ?
           AND created_at < (
             SELECT created_at FROM audit_log
             WHERE account_id = ?
             ORDER BY created_at DESC
             LIMIT 1 OFFSET 499
           )`,
      )
      .bind(input.accountId, input.accountId)
      .run();
  } catch (error) {
    console.error("audit log failed", error);
  }
}

export async function auditMutation(
  db: D1Database,
  actor: Actor,
  method: string,
  pathname: string,
  options: { viaApi?: boolean } = {},
): Promise<void> {
  let action = describeMutation(method, pathname);
  if (!action) return;
  if (options.viaApi) action += " via API";
  if (actor.impersonating) action += " (support access)";
  await recordAudit(db, {
    accountId: actor.account_id,
    actorUserId: actor.id,
    actorEmail: actor.email,
    action,
  });
}

export async function listAuditLog(
  db: D1Database,
  accountId: string,
  limit = 100,
): Promise<AuditEntry[]> {
  const capped = Math.min(Math.max(limit, 1), 200);
  const { results } = await db
    .prepare(
      `SELECT id, actor_email, action, created_at FROM (
         SELECT id, actor_email, action, created_at
         FROM audit_log
         WHERE account_id = ?
         UNION ALL
         SELECT a.id,
                COALESCE(u.email, a.actor_user_id) AS actor_email,
                CASE a.action
                  WHEN 'impersonate' THEN 'Opened this account for support'
                  WHEN 'stop_impersonation' THEN 'Left support access'
                  ELSE a.action
                END AS action,
                a.created_at
         FROM account_access_log a
         LEFT JOIN users u ON u.id = a.actor_user_id
         WHERE a.account_id = ?
       )
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(accountId, accountId, capped)
    .all<AuditEntry>();
  return results ?? [];
}

function lastId(path: string): string | null {
  const parts = path.split("/");
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part && /^[a-z]{2,6}_[a-z0-9]+$/i.test(part)) return part;
  }
  return null;
}

function labelFor(method: string, path: string): string | null {
  if (path === "/api/programs" && method === "POST") return "Created a campaign";
  if (/^\/api\/programs\/[^/]+$/.test(path) && method === "PATCH") return "Updated a campaign";
  if (/^\/api\/programs\/[^/]+$/.test(path) && method === "DELETE") return "Archived a campaign";
  if (/^\/api\/programs\/[^/]+\/affiliates$/.test(path) && method === "POST") return "Added an affiliate";
  if (/^\/api\/programs\/[^/]+\/paths$/.test(path) && method === "POST") return "Added a path";
  if (/^\/api\/programs\/[^/]+\/paths\/[^/]+$/.test(path) && method === "PATCH") return "Updated a path";
  if (/^\/api\/programs\/[^/]+\/paths\/[^/]+$/.test(path) && method === "DELETE") return "Deleted a path";
  if (/^\/api\/programs\/[^/]+\/rotation$/.test(path) && method === "PUT") return "Updated path rotation";
  if (/^\/api\/programs\/[^/]+\/rules$/.test(path) && method === "POST") return "Created a routing rule";
  if (/^\/api\/programs\/[^/]+\/rules\/[^/]+$/.test(path) && method === "PATCH") return "Updated a routing rule";
  if (/^\/api\/programs\/[^/]+\/rules\/[^/]+$/.test(path) && method === "DELETE") return "Deleted a routing rule";
  if (/^\/api\/programs\/[^/]+\/traffic-filter$/.test(path) && method === "PUT") return "Updated the traffic filter";
  if (/^\/api\/programs\/[^/]+\/costs$/.test(path) && method === "POST") return "Updated campaign cost";
  if (/^\/api\/ops\/programs\/[^/]+\/clone$/.test(path) && method === "POST") return "Cloned a campaign";
  if (path === "/api/ops/programs/bulk" && method === "POST") return "Updated campaigns in bulk";
  if (path === "/api/ops/notes" && method === "POST") return "Added a note";
  if (/^\/api\/ops\/notes\/[^/]+$/.test(path) && method === "DELETE") return "Deleted a note";
  if (path === "/api/ops/triggers" && method === "POST") return "Created a trigger";
  if (/^\/api\/ops\/triggers\/[^/]+$/.test(path) && method === "DELETE") return "Deleted a trigger";
  if (path === "/api/ops/postback-key" && method === "PUT") return "Updated the postback key";
  if (path === "/api/ops/postback-key/rotate" && method === "POST") return "Rotated the postback key";
  if (path === "/api/settings" && method === "PUT") return "Updated the report timezone";
  if (path === "/api/tracking-domains" && method === "POST") return "Added a tracking domain";
  if (/^\/api\/tracking-domains\/[^/]+$/.test(path) && method === "DELETE") return "Removed a tracking domain";
  if (/^\/api\/tracking-domains\/campaigns\/[^/]+$/.test(path) && method === "PUT") {
    return "Changed a campaign tracking domain";
  }
  if (path === "/api/automation/rules" && method === "POST") return "Created an automation rule";
  if (/^\/api\/automation\/rules\/[^/]+$/.test(path) && method === "PATCH") return "Updated an automation rule";
  if (/^\/api\/automation\/rules\/[^/]+$/.test(path) && method === "DELETE") return "Deleted an automation rule";
  if (/^\/api\/automation\/rules\/[^/]+\/run$/.test(path) && method === "POST") return "Ran an automation rule";
  if (path === "/api/automation/blacklist" && method === "POST") return "Added zones to the blacklist";
  if (/^\/api\/automation\/blacklist\/[^/]+$/.test(path) && method === "DELETE") return "Removed a blacklisted zone";
  if (path === "/api/antifraud/blocklist" && method === "POST") return "Added a blocklist entry";
  if (/^\/api\/antifraud\/blocklist\/[^/]+$/.test(path) && method === "DELETE") return "Removed a blocklist entry";
  if (path === "/api/tokens" && method === "POST") return "Created an API token";
  if (/^\/api\/tokens\/[^/]+$/.test(path) && method === "DELETE") return "Deleted an API token";
  if (path === "/api/postbacks" && method === "POST") return "Created a postback";
  if (/^\/api\/postbacks\/[^/]+$/.test(path) && method === "PATCH") return "Updated a postback";
  if (/^\/api\/postbacks\/[^/]+$/.test(path) && method === "DELETE") return "Deleted a postback";
  if (path === "/api/sources/from-template" && method === "POST") return "Created a traffic source";
  if (path === "/api/sources/networks/from-template" && method === "POST") return "Created a network";
  if (/^\/api\/sources\/[^/]+\/settings$/.test(path) && method === "PUT") return "Updated traffic source settings";
  if (/^\/api\/sources\/[^/]+\/sync-cost$/.test(path) && method === "POST") return "Synced traffic source cost";
  if (path === "/api/auth/logout" && method === "POST") return "Signed out";
  if (path === "/api/auth/logout-all" && method === "POST") return "Signed out everywhere";

  const entity = path.match(
    /^\/api\/entities\/(groups|traffic-sources|networks|landers|offers)(?:\/[^/]+)?$/,
  );
  if (!entity) return null;
  const name =
    entity[1] === "traffic-sources" ? "traffic source" : entity[1].replace(/s$/, "");
  const article = name === "offer" ? "an" : "a";
  if (method === "POST") return `Created ${article} ${name}`;
  if (method === "PATCH" || method === "PUT") return `Updated ${article} ${name}`;
  if (method === "DELETE") return `Deleted ${article} ${name}`;
  return null;
}
