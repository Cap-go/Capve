import { Hono } from "hono";
import { addBlocklistEntries, deleteBlocklistEntry, listBlocklist } from "../db/antifraud";
import type { Env } from "../types";
import { requireUser, requireWrite } from "../lib/access";
import {
  BLOCKLIST_KINDS,
  DATACENTER_ASNS,
  normalizeBlocklistValue,
  type BlocklistKind,
} from "../lib/antifraud";

/** Account-wide blocklist (IP/CIDR, ASN, UA substring). Matching clicks are flagged as bots. */
const antifraud = new Hono<{ Bindings: Env }>();

const MAX_VALUES_PER_REQUEST = 200;

antifraud.get("/blocklist", async (c) => {
  const session = await requireUser(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({
    entries: await listBlocklist(c.env.DB, session.account_id),
    datacenter_asns: [...DATACENTER_ASNS],
  });
});

antifraud.post("/blocklist", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const body = await c.req.json<{ kind?: BlocklistKind; value?: string; values?: string[] | string }>();
  if (!body.kind || !BLOCKLIST_KINDS.includes(body.kind)) {
    return c.json({ error: "kind must be ip, asn or ua" }, 400);
  }
  const raw = [
    ...(typeof body.value === "string" ? [body.value] : []),
    ...(Array.isArray(body.values)
      ? body.values
      : typeof body.values === "string"
        ? body.values.split(/[,\n]/)
        : []),
  ].filter((v): v is string => typeof v === "string" && v.trim() !== "");
  if (raw.length === 0) return c.json({ error: "value required" }, 400);
  if (raw.length > MAX_VALUES_PER_REQUEST) return c.json({ error: "Too many values" }, 400);

  const values: string[] = [];
  for (const item of raw) {
    const value = normalizeBlocklistValue(body.kind, item);
    if (!value) return c.json({ error: `Invalid ${body.kind} value: ${item.trim()}` }, 400);
    if (!values.includes(value)) values.push(value);
  }

  await addBlocklistEntries(c.env.DB, session.account_id, body.kind, values);
  return c.json({ entries: await listBlocklist(c.env.DB, session.account_id) }, 201);
});

antifraud.delete("/blocklist/:entryId", async (c) => {
  const session = await requireWrite(c);
  if (session instanceof Response) return session;

  const deleted = await deleteBlocklistEntry(c.env.DB, session.account_id, c.req.param("entryId"));
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export { antifraud };
