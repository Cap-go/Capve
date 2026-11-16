import { Hono } from "hono";
import { Validator } from "@cfworker/json-schema";
import { PLATFORMS, PLATFORM_IDS, type PlatformId, type PlatformResult, type PlatformSettings } from "../../shared/platforms";
import { entityBelongsTo } from "../db/entities";
import { requireUser, requireWrite } from "../lib/access";
import { openSecret, sealSecret } from "../lib/secret-box";
import { executeProvider, PlatformError, prepareAction, providerRejected } from "../lib/platform-providers";
import type { Env } from "../types";

type Connection = { traffic_source_id: string; provider: PlatformId; credential_sealed: string | null; enabled: number; allow_writes: number; revision: number };
const connection = (db: D1Database, id: string) => db.prepare("SELECT * FROM platform_connections WHERE traffic_source_id = ?").bind(id).first<Connection>();
function settings(row: Connection | null, id: string): PlatformSettings {
  return { traffic_source_id: id, provider: row?.provider ?? null, enabled: !!row?.enabled, allow_writes: !!row?.allow_writes, has_credential: !!row?.credential_sealed, revision: row?.revision ?? 0 };
}
const configValidator = new Validator({ type: "object", additionalProperties: false, required: ["provider", "enabled", "allow_writes", "revision"], properties: {
  provider: { type: "string", enum: [...PLATFORM_IDS] }, enabled: { type: "boolean" }, allow_writes: { type: "boolean" },
  revision: { type: "integer", minimum: 0 }, credential: { type: ["string", "null"], minLength: 1, maxLength: 4096, pattern: "^[^\\s]+$" },
} });
const actionValidator = new Validator({ type: "object", additionalProperties: false, required: ["action", "params", "revision"], properties: {
  action: { type: "string", maxLength: 100 }, params: { type: "object" }, revision: { type: "integer", minimum: 1 },
  operation_id: { type: "string", pattern: "^[a-zA-Z0-9_-]{16,80}$" },
} });
const platforms = new Hono<{ Bindings: Env }>();
platforms.get("/", async (c) => {
  if (!(await requireUser(c))) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ beta: true, providers: PLATFORMS });
});
platforms.get("/sources/:id", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  if (!(await entityBelongsTo(c.env.DB, "traffic_source", id, session.account_id))) return c.json({ error: "Not found" }, 404);
  return c.json({ settings: settings(await connection(c.env.DB, id), id) });
});
platforms.put("/sources/:id", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;
  const id = c.req.param("id");
  if (!(await entityBelongsTo(c.env.DB, "traffic_source", id, session.account_id))) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => null);
  if (!configValidator.validate(body).valid) return c.json({ error: "Invalid integration settings" }, 400);
  const old = await connection(c.env.DB, id);
  if ((old?.revision ?? 0) !== body.revision) return c.json({ error: "Integration changed. Reload settings first." }, 409);
  const changed = old?.provider !== body.provider;
  let sealed = changed ? null : old?.credential_sealed ?? null;
  if (body.credential !== undefined) sealed = body.credential === null ? null : await sealSecret(body.credential, c.env.AUTH_SECRET);
  if (body.enabled && !sealed) return c.json({ error: "Add a management credential before enabling." }, 400);
  if (body.allow_writes && (!body.enabled || !PLATFORMS.find((p) => p.id === body.provider)?.actions.some((a) => !a.read_only))) return c.json({ error: "Write access requires an enabled integration with supported write actions." }, 400);
  const result = old
    ? await c.env.DB.prepare("UPDATE platform_connections SET provider=?, credential_sealed=?, enabled=?, allow_writes=?, revision=revision+1 WHERE traffic_source_id=? AND revision=?")
      .bind(body.provider, sealed, Number(body.enabled), Number(body.allow_writes), id, body.revision).run()
    : await c.env.DB.prepare("INSERT OR IGNORE INTO platform_connections (traffic_source_id,provider,credential_sealed,enabled,allow_writes) VALUES (?,?,?,?,?)")
      .bind(id, body.provider, sealed, Number(body.enabled), Number(body.allow_writes)).run();
  if (!result.meta.changes) return c.json({ error: "Integration changed. Reload settings first." }, 409);
  return c.json({ settings: settings(await connection(c.env.DB, id), id) });
});

for (const mode of ["read", "execute"] as const) platforms.post(`/sources/:id/${mode}`, async (c) => {
  const session = mode === "execute" ? await requireWrite(c) : await requireUser(c);
  if (session instanceof Response) return session;
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id")!;
  if (!(await entityBelongsTo(c.env.DB, "traffic_source", id, session.account_id))) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => null);
  if (!actionValidator.validate(body).valid) return c.json({ error: "Invalid action request" }, 400);
  const row = await connection(c.env.DB, id);
  if (!row?.enabled || !row.credential_sealed) return c.json({ error: "Enable this beta integration and add credentials first." }, 409);
  if (row.revision !== body.revision) return c.json({ error: "Integration changed. Reload settings first." }, 409);
  let prepared;
  try { prepared = prepareAction(row.provider, body.action, body.params); }
  catch (error) { return c.json({ error: error instanceof PlatformError ? error.message : "Invalid action" }, 400); }
  const write = !prepared.action.read_only;
  if (write !== (mode === "execute")) return c.json({ error: "Use the read endpoint for reads and execute endpoint for changes." }, 400);
  if (write && !row.allow_writes) return c.json({ error: "Remote changes are disabled for this integration." }, 403);
  if (write && !body.operation_id) return c.json({ error: "A unique operation_id is required for remote changes. Reuse it when retrying this exact request." }, 400);
  const credential = await openSecret(row.credential_sealed, c.env.AUTH_SECRET);
  if (!credential) return c.json({ error: "Re-enter this integration's credential." }, 409);
  const operationId: string | null = write ? body.operation_id : null;
  if (write) {
    // Canonical validated payload prevents object-key order from turning a retry into a different request.
    const payload = JSON.stringify({ provider: row.provider, revision: row.revision, action: body.action, params: Object.fromEntries(Object.entries(body.params).sort(([a], [b]) => a.localeCompare(b))) });
    const inserted = await c.env.DB.prepare("INSERT OR IGNORE INTO platform_operations (traffic_source_id,operation_id,actor_id,provider,action,request_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM platform_connections WHERE traffic_source_id=? AND revision=? AND enabled=1 AND allow_writes=1)")
      .bind(id, operationId, session.id, row.provider, body.action, payload, Date.now(), id, row.revision).run();
    if (!inserted.meta.changes) {
      const prior = await c.env.DB.prepare("SELECT request_json,result_json FROM platform_operations WHERE traffic_source_id=? AND operation_id=?").bind(id, operationId).first<{ request_json: string; result_json: string | null }>();
      if (!prior || prior.request_json !== payload) return c.json({ error: "Integration changed or operation_id was already used for a different request." }, 409);
      const result: PlatformResult = prior.result_json ? JSON.parse(prior.result_json) : { provider: row.provider, action: body.action, status: "unknown", data: null, operation_id: operationId, message: "This operation is pending or its result is unknown. Inspect the provider before submitting another operation." };
      return c.json({ result });
    }
  }
  let result: PlatformResult;
  try {
    const data = await executeProvider(row.provider, prepared.request, credential);
    const failed = providerRejected(data);
    result = { provider: row.provider, action: body.action, status: failed ? "failed" : "accepted", data, operation_id: operationId,
      message: failed ? "The provider reported a failure. Inspect its result before making another change." : write ? "The provider accepted the request. Read the campaign again to verify its current state." : "Provider data retrieved." };
  } catch (error) {
    result = { provider: row.provider, action: body.action, status: write ? "unknown" : "failed", data: null, operation_id: operationId,
      message: error instanceof PlatformError ? error.message : "Provider request failed or timed out. No automatic retry was sent." };
  }
  if (write) await c.env.DB.prepare("UPDATE platform_operations SET result_json=? WHERE traffic_source_id=? AND operation_id=?").bind(JSON.stringify(result), id, operationId).run();
  return c.json({ result });
});

platforms.get("/sources/:id/operations", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  if (!(await entityBelongsTo(c.env.DB, "traffic_source", id, session.account_id))) return c.json({ error: "Not found" }, 404);
  const { results } = await c.env.DB.prepare("SELECT operation_id,actor_id,provider,action,request_json,created_at,CASE WHEN result_json IS NULL THEN NULL ELSE json_set(result_json,'$.data',NULL) END AS result_json FROM platform_operations WHERE traffic_source_id=? ORDER BY created_at DESC LIMIT 50").bind(id).all<{ operation_id: string; actor_id: string; provider: PlatformId; action: string; request_json: string; created_at: number; result_json: string | null }>();
  return c.json({ operations: results.map(({ request_json, result_json, ...op }) => ({ ...op, request: JSON.parse(request_json), result: result_json ? JSON.parse(result_json) : null })) });
});
export default platforms;
