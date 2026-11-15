import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../worker";
import { listHostnameCleanup, listTrackingDomains, saveHostnameCheck } from "../worker/db/tracking-domains";
import { retryHostnameCleanup } from "../worker/lib/tracking-domain-cleanup";
import { domainStatus, hostnameSetup } from "../worker/lib/custom-hostnames";
import { MAX_AUTOMATIC_DOMAINS } from "../worker/routes/tracking-domains";
import type { Env } from "../worker/types";
import { registerTestUser } from "./helpers";
import { initSql } from "./schema";

const ZONE = "zone_test";
const API = `https://api.cloudflare.com/client/v4/zones/${ZONE}/custom_hostnames`;
const automatic: Env = {
  ...(env as unknown as Env),
  APP_URL: "https://capve.test",
  TRACKING_DOMAIN_ZONE_ID: ZONE,
  TRACKING_DOMAIN_API_TOKEN: "cf-test-token",
  TRACKING_DOMAIN_CNAME_TARGET: "domains.capve.test",
};
const manual: Env = { ...(env as unknown as Env), APP_URL: "https://capve.test" };

type DomainView = {
  id: string;
  hostname: string;
  status: string;
  ssl_status: string | null;
  dns_records: Array<{ type: string; name: string; value: string }>;
  errors: string[];
};

let headers: Record<string, string>;
let accountId: string;

async function call<T>(path: string, init: RequestInit = {}, bindings: Env = automatic) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(`http://localhost${path}`, { ...init, headers: { ...headers, ...init.headers } }),
    bindings,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return { status: response.status, body: (await response.json()) as T };
}

function add(hostname: string, bindings: Env = automatic) {
  return call<{ tracking_domain: DomainView; error?: string }>(
    "/api/tracking-domains",
    { method: "POST", body: JSON.stringify({ hostname }) },
    bindings,
  );
}

function list(bindings: Env = automatic) {
  return call<{ tracking_domains: DomainView[]; automatic: boolean; cname_target: string | null }>(
    "/api/tracking-domains",
    {},
    bindings,
  );
}

function hostname(id: string, name: string, status: string, ssl: string, extra: object = {}) {
  return { id, hostname: name, status, ssl: { status: ssl }, ...extra };
}

function ok(result: unknown, status = 200) {
  return Response.json({ success: true, errors: [], result }, { status });
}

function fail(status: number, code: number, message: string) {
  return Response.json({ success: false, errors: [{ code, message }], result: null }, { status });
}

/** Routes Cloudflare API calls to `handler`; records them as "METHOD path?query". */
function mockCloudflare(handler: (method: string, path: string, body: unknown) => Response | Promise<Response>) {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (!url.href.startsWith(API)) throw new Error(`unexpected fetch ${url.href}`);
    expect(request.headers.get("authorization")).toBe("Bearer cf-test-token");
    const path = url.href.slice(API.length);
    const body = request.method === "GET" || request.method === "DELETE" ? undefined : await request.json();
    calls.push(`${request.method} ${path}`);
    bodies.push(body);
    return handler(request.method, path, body);
  });
  return { calls, bodies };
}

/** Makes every domain due for a Cloudflare check on the next list. */
async function expireChecks() {
  await env.DB.prepare("UPDATE tracking_domains SET checked_at = 0 WHERE user_id = ?").bind(accountId).run();
}

async function removeAll() {
  await env.DB.prepare("DELETE FROM tracking_domains WHERE user_id = ?").bind(accountId).run();
  await env.DB.prepare("DELETE FROM tracking_domain_cleanup").run();
}

beforeAll(async () => {
  for (const statement of initSql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
  ({ authHeaders: headers } = await registerTestUser());
  headers = { ...headers, "Content-Type": "application/json" };
  const me = await call<{ user: { id: string } }>("/api/auth/me");
  accountId = me.body.user.id;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await removeAll();
});

describe("automatic tracking domain setup", () => {
  it("registers the hostname with Cloudflare and returns the CNAME record to add", async () => {
    const cf = mockCloudflare(() => ok(hostname("ch_1", "track.example.com", "pending", "initializing"), 201));

    const created = await add("https://Track.Example.com/");
    expect(created.status).toBe(201);
    expect(cf.calls).toEqual(["POST "]);
    expect(cf.bodies[0]).toEqual({
      hostname: "track.example.com",
      ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
    });
    expect(created.body.tracking_domain).toMatchObject({
      hostname: "track.example.com",
      status: "pending",
      dns_records: [{ type: "CNAME", name: "track.example.com", value: "domains.capve.test" }],
    });

    // Listing right away doesn't call Cloudflare again.
    const listed = await list();
    expect(cf.calls).toHaveLength(1);
    expect(listed.body.automatic).toBe(true);
    expect(listed.body.cname_target).toBe("domains.capve.test");
    expect(listed.body.tracking_domains.map((d) => d.status)).toEqual(["pending"]);
  });

  it("turns active once Cloudflare validates the CNAME and issues the certificate", async () => {
    let state = hostname("ch_2", "go.example.com", "pending", "pending_validation", {
      verification_errors: ["custom hostname does not CNAME to this zone."],
    });
    const cf = mockCloudflare((method) => ok(method === "POST" ? hostname("ch_2", "go.example.com", "pending", "initializing") : state));
    await add("go.example.com");

    await expireChecks();
    let listed = await list();
    expect(cf.calls).toEqual(["POST ", "GET /ch_2"]);
    expect(listed.body.tracking_domains[0]).toMatchObject({
      status: "pending",
      errors: ["custom hostname does not CNAME to this zone."],
    });

    state = hostname("ch_2", "go.example.com", "active", "active");
    await expireChecks();
    listed = await list();
    expect(listed.body.tracking_domains[0]).toMatchObject({ status: "active", ssl_status: "active", errors: [] });

    // Live domains are re-checked hourly, not on every list.
    await env.DB.prepare("UPDATE tracking_domains SET checked_at = ? WHERE user_id = ?")
      .bind(Date.now() - 60_000, accountId)
      .run();
    await list();
    expect(cf.calls).toHaveLength(3);
  });

  it("restarts validation after a timeout", async () => {
    const cf = mockCloudflare((method) => {
      if (method === "POST") return ok(hostname("ch_3", "t.example.com", "pending", "initializing"));
      if (method === "GET") return ok(hostname("ch_3", "t.example.com", "pending", "validation_timed_out"));
      return ok(hostname("ch_3", "t.example.com", "pending", "pending_validation"));
    });
    await add("t.example.com");
    await expireChecks();
    const listed = await list();
    expect(cf.calls).toEqual(["POST ", "GET /ch_3", "PATCH /ch_3"]);
    expect(cf.bodies[2]).toEqual({ ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } });
    expect(listed.body.tracking_domains[0]).toMatchObject({ status: "pending", ssl_status: "pending_validation" });
  });

  it("adopts a hostname that is already on the zone", async () => {
    const cf = mockCloudflare((method) =>
      method === "POST"
        ? fail(409, 1406, "Duplicate custom hostname found.")
        : ok([hostname("ch_old", "dup.example.com", "active", "active")]),
    );
    const created = await add("dup.example.com");
    expect(created.status).toBe(201);
    expect(cf.calls).toEqual(["POST ", "GET ?hostname=dup.example.com"]);
    expect(created.body.tracking_domain.status).toBe("active");
  });

  it("rolls back when Cloudflare refuses the hostname", async () => {
    mockCloudflare(() => fail(400, 1411, "Custom hostname is prohibited."));
    const refused = await add("bad.example.com");
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain("Custom hostname is prohibited.");
    vi.restoreAllMocks();

    mockCloudflare(() => fail(503, 1000, "Service unavailable"));
    const down = await add("bad.example.com");
    expect(down.status).toBe(502);
    vi.restoreAllMocks();

    expect((await list(manual)).body.tracking_domains).toEqual([]);
  });

  it("removes a hostname a status check attached before a failed add rolled back", async () => {
    const cf = mockCloudflare(async (method) => {
      if (method === "POST") {
        // A parallel list provisions the new row while this add is still waiting on Cloudflare.
        const [row] = await listTrackingDomains(env.DB, accountId);
        await saveHostnameCheck(env.DB, row, {
          hostname: hostname("ch_parallel", "racy.example.com", "pending", "initializing"),
        });
        return fail(503, 1000, "Service unavailable");
      }
      return ok({ id: "ch_parallel" });
    });
    const failed = await add("racy.example.com");
    expect(failed.status).toBe(502);
    expect(cf.calls).toEqual(["POST ", "DELETE /ch_parallel"]);
    expect(await listTrackingDomains(env.DB, accountId)).toEqual([]);
  });

  it("reserves the app host, its subdomains and the CNAME target", async () => {
    const cf = mockCloudflare(() => ok(hostname("ch_x", "x", "pending", "initializing")));
    for (const reserved of ["capve.test", "track.capve.test", "domains.capve.test"]) {
      expect((await add(reserved)).status).toBe(400);
    }
    expect(cf.calls).toEqual([]);
  });

  it("caps automatic domains per account", async () => {
    const now = Date.now();
    for (let index = 0; index < MAX_AUTOMATIC_DOMAINS; index++) {
      await env.DB.prepare(
        "INSERT INTO tracking_domains (id, user_id, hostname, created_at, checked_at) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(`dom_cap_${index}`, accountId, `cap${index}.example.com`, now, now)
        .run();
    }
    const cf = mockCloudflare(() => ok(hostname("ch_cap", "one-more.example.com", "pending", "initializing")));
    const capped = await add("one-more.example.com");
    expect(capped.status).toBe(400);
    expect(cf.calls).toEqual([]);
  });

  it("never goes past the cap when domains are added at the same time", async () => {
    const now = Date.now();
    for (let index = 0; index < MAX_AUTOMATIC_DOMAINS - 2; index++) {
      await env.DB.prepare(
        "INSERT INTO tracking_domains (id, user_id, hostname, created_at, checked_at) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(`dom_race_${index}`, accountId, `race${index}.example.com`, now, now)
        .run();
    }
    let next = 0;
    mockCloudflare(async (_method, _path, body) => {
      const { hostname: name } = body as { hostname: string };
      return ok(hostname(`ch_race_${next++}`, name, "pending", "initializing"));
    });
    const results = await Promise.all(
      ["a", "b", "c", "d", "e"].map((name) => add(`${name}.parallel.example.com`)),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(2);
    expect(results.filter((result) => result.status === 400)).toHaveLength(3);
    expect(await listTrackingDomains(env.DB, accountId)).toHaveLength(MAX_AUTOMATIC_DOMAINS);
  });

  it("deletes a hostname a status check recreated for a domain removed meanwhile", async () => {
    mockCloudflare(() => ok(hostname("ch_9", "gone.example.com", "pending", "initializing")));
    await add("gone.example.com");
    vi.restoreAllMocks();

    const cf = mockCloudflare(async (method, path) => {
      if (method === "GET") {
        // The domain is removed while the check is running: Cloudflare already lost ch_9.
        await env.DB.prepare("DELETE FROM tracking_domains WHERE user_id = ?").bind(accountId).run();
        return fail(404, 1436, "Custom hostname not found.");
      }
      if (method === "POST") return ok(hostname("ch_10", "gone.example.com", "pending", "initializing"));
      return ok({ id: path.slice(1) });
    });
    await expireChecks();
    const listed = await list();
    expect(cf.calls).toEqual(["GET /ch_9", "POST ", "DELETE /ch_10"]);
    expect(listed.body.tracking_domains).toEqual([]);
  });

  it("queues a leftover hostname when Cloudflare fails to delete it, and retries hourly", async () => {
    mockCloudflare(() => ok(hostname("ch_20", "left.example.com", "pending", "initializing")));
    await add("left.example.com");
    vi.restoreAllMocks();

    mockCloudflare(async (method) => {
      if (method === "GET") {
        await env.DB.prepare("DELETE FROM tracking_domains WHERE user_id = ?").bind(accountId).run();
        return fail(404, 1436, "Custom hostname not found.");
      }
      if (method === "POST") return ok(hostname("ch_21", "left.example.com", "pending", "initializing"));
      return fail(503, 1000, "Service unavailable");
    });
    await expireChecks();
    await list();
    vi.restoreAllMocks();
    expect(await listHostnameCleanup(env.DB, 10)).toMatchObject([
      { cf_hostname_id: "ch_21", hostname: "left.example.com", attempts: 1, last_error: "Service unavailable" },
    ]);

    // Still failing: kept, with the attempt counted.
    mockCloudflare(() => fail(503, 1000, "Service unavailable"));
    expect(await retryHostnameCleanup(automatic)).toEqual({ deleted: 0, failed: 1 });
    expect((await listHostnameCleanup(env.DB, 10))[0].attempts).toBe(2);
    vi.restoreAllMocks();

    const cf = mockCloudflare(() => ok({ id: "ch_21" }));
    expect(await retryHostnameCleanup(automatic)).toEqual({ deleted: 1, failed: 0 });
    expect(cf.calls).toEqual(["DELETE /ch_21"]);
    expect(await listHostnameCleanup(env.DB, 10)).toEqual([]);
  });

  it("drops a queued hostname that a domain uses again", async () => {
    mockCloudflare(() => ok(hostname("ch_back", "back.example.com", "pending", "initializing")));
    await add("back.example.com");
    vi.restoreAllMocks();
    await env.DB.prepare(
      "INSERT INTO tracking_domain_cleanup (cf_hostname_id, hostname, created_at) VALUES ('ch_back', 'back.example.com', 1)",
    ).run();

    const cf = mockCloudflare(() => ok({ id: "ch_back" }));
    expect(await retryHostnameCleanup(automatic)).toEqual({ deleted: 0, failed: 0 });
    expect(cf.calls).toEqual([]);
    expect(await listHostnameCleanup(env.DB, 10)).toEqual([]);
    expect(await retryHostnameCleanup(manual)).toEqual({ deleted: 0, failed: 0 });
  });

  it("lets only one request remove a domain at a time", async () => {
    mockCloudflare(() => ok(hostname("ch_once", "once.example.com", "active", "active")));
    const created = await add("once.example.com");
    vi.restoreAllMocks();
    const path = `/api/tracking-domains/${created.body.tracking_domain.id}`;

    let second: { status: number; body: { error?: string } } | undefined;
    const cf = mockCloudflare(async () => {
      // A second removal arrives while the first is deleting the hostname.
      second = await call<{ error?: string }>(path, { method: "DELETE" });
      return ok({ id: "ch_once" });
    });
    const first = await call(path, { method: "DELETE" });
    expect(first.status).toBe(200);
    expect(second).toMatchObject({ status: 409, body: { error: "This domain is already being removed." } });
    expect(cf.calls).toEqual(["DELETE /ch_once"]);
    expect(await listTrackingDomains(env.DB, accountId)).toEqual([]);
  });

  it("takes over a removal claim left by a request that died", async () => {
    mockCloudflare(() => ok(hostname("ch_stale", "stale.example.com", "active", "active")));
    const created = await add("stale.example.com");
    vi.restoreAllMocks();
    await env.DB.prepare("UPDATE tracking_domains SET removal_claim = 'dead', deleting_at = 1 WHERE user_id = ?")
      .bind(accountId)
      .run();
    mockCloudflare(() => ok({ id: "ch_stale" }));
    const removed = await call(`/api/tracking-domains/${created.body.tracking_domain.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
  });

  it("doesn't adopt a hostname that a cleanup is deleting, and retries later", async () => {
    await env.DB.prepare(
      "INSERT INTO tracking_domain_cleanup (cf_hostname_id, hostname, claim, claimed_at, created_at) VALUES ('ch_dying', 'again.example.com', 'cron', ?, 1)",
    )
      .bind(Date.now())
      .run();
    mockCloudflare((method) =>
      method === "POST"
        ? fail(409, 1406, "Duplicate custom hostname found.")
        : ok([hostname("ch_dying", "again.example.com", "active", "active")]),
    );
    const created = await add("again.example.com");
    expect(created.status).toBe(201);
    expect(created.body.tracking_domain).toMatchObject({ status: "failed" });
    expect(created.body.tracking_domain.errors[0]).toContain("still deleting an earlier setup");
    const [row] = await listTrackingDomains(env.DB, accountId);
    expect(row.cf_hostname_id).toBeNull();
    vi.restoreAllMocks();

    // The cleanup finishes; the next check registers a fresh hostname.
    await env.DB.prepare("DELETE FROM tracking_domain_cleanup").run();
    mockCloudflare(() => ok(hostname("ch_fresh", "again.example.com", "pending", "initializing")));
    await expireChecks();
    const listed = await list();
    expect(listed.body.tracking_domains[0]).toMatchObject({ status: "pending", errors: [] });
  });

  it("stops status checks from writing to a domain while it is removed", async () => {
    mockCloudflare(() => ok(hostname("ch_11", "mark.example.com", "pending", "initializing")));
    const created = await add("mark.example.com");
    vi.restoreAllMocks();

    let saveDuringRemoval: unknown = "not called";
    mockCloudflare(async () => {
      const [domain] = await listTrackingDomains(env.DB, accountId);
      saveDuringRemoval = await saveHostnameCheck(env.DB, domain, {
        hostname: hostname("ch_12", "mark.example.com", "pending", "initializing"),
      });
      return ok({ id: "ch_11" });
    });
    const removed = await call(`/api/tracking-domains/${created.body.tracking_domain.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect(saveDuringRemoval).toBeNull();
  });

  it("keeps a newer hostname when a parallel check fails with an older snapshot", async () => {
    mockCloudflare(() => ok(hostname("ch_old", "both.example.com", "pending", "initializing")));
    await add("both.example.com");
    vi.restoreAllMocks();
    const [stale] = await listTrackingDomains(env.DB, accountId);

    // One check recreates the hostname as ch_new...
    mockCloudflare((method) =>
      method === "GET"
        ? fail(404, 1436, "Custom hostname not found.")
        : ok(hostname("ch_new", "both.example.com", "pending", "initializing")),
    );
    await expireChecks();
    await list();
    vi.restoreAllMocks();

    // ...while another, started from the older row, fails and saves its error.
    const saved = await saveHostnameCheck(env.DB, stale, { errors: ["Internal error"] });
    expect(saved).toMatchObject({ cf_hostname_id: "ch_new", cf_errors: JSON.stringify(["Internal error"]) });
    const [row] = await listTrackingDomains(env.DB, accountId);
    expect(row.cf_hostname_id).toBe("ch_new");
  });

  it("registers domains added by hand only up to the cap, oldest first", async () => {
    for (let index = 0; index <= MAX_AUTOMATIC_DOMAINS; index++) {
      await env.DB.prepare("INSERT INTO tracking_domains (id, user_id, hostname, created_at) VALUES (?, ?, ?, ?)")
        .bind(`dom_hand_${index}`, accountId, `hand${index}.example.com`, 1_000 + index)
        .run();
    }
    const cf = mockCloudflare(async (_method, _path, body) => {
      const { hostname: name } = body as { hostname: string };
      return ok(hostname(`ch_${name}`, name, "pending", "initializing"));
    });
    const listed = await list();
    expect(cf.calls).toHaveLength(MAX_AUTOMATIC_DOMAINS);
    const newest = listed.body.tracking_domains.find((domain) => domain.hostname === `hand${MAX_AUTOMATIC_DOMAINS}.example.com`);
    expect(newest).toMatchObject({ status: "failed" });
    expect(newest?.errors[0]).toContain(`Over the limit of ${MAX_AUTOMATIC_DOMAINS}`);
    expect(listed.body.tracking_domains.filter((domain) => domain.status === "pending")).toHaveLength(
      MAX_AUTOMATIC_DOMAINS,
    );

    // Once an older domain is gone, the next check registers it.
    await env.DB.prepare("DELETE FROM tracking_domains WHERE id = 'dom_hand_0'").run();
    await expireChecks();
    const after = await list();
    // The 19 remaining domains are re-checked; only the newly eligible one is registered.
    const second = cf.calls.slice(MAX_AUTOMATIC_DOMAINS);
    expect(second.filter((entry) => entry === "POST ")).toHaveLength(1);
    expect(second.filter((entry) => entry.startsWith("GET "))).toHaveLength(MAX_AUTOMATIC_DOMAINS - 1);
    expect(after.body.tracking_domains.every((domain) => domain.status === "pending")).toBe(true);
  });

  it("keeps an automatic domain while automatic setup is off, so its hostname isn't orphaned", async () => {
    mockCloudflare(() => ok(hostname("ch_keep", "keep.example.com", "active", "active")));
    const created = await add("keep.example.com");
    vi.restoreAllMocks();

    const blocked = await call<{ error: string }>(
      `/api/tracking-domains/${created.body.tracking_domain.id}`,
      { method: "DELETE" },
      manual,
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain("automatic setup is now off");
    const [kept] = await listTrackingDomains(env.DB, accountId);
    expect(kept).toMatchObject({ cf_hostname_id: "ch_keep", deleting_at: null });

    const cf = mockCloudflare(() => ok({ id: "ch_keep" }));
    const removed = await call(`/api/tracking-domains/${created.body.tracking_domain.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect(cf.calls).toEqual(["DELETE /ch_keep"]);
  });

  it("retries registering a domain added by hand after Cloudflare recovers", async () => {
    await add("retry.example.com", manual);
    mockCloudflare(() => fail(503, 1000, "Service unavailable"));
    let listed = await list();
    expect(listed.body.tracking_domains[0]).toMatchObject({ status: "failed", errors: ["Service unavailable"] });
    vi.restoreAllMocks();

    mockCloudflare(() => ok(hostname("ch_retry", "retry.example.com", "pending", "initializing")));
    await expireChecks();
    listed = await list();
    expect(listed.body.tracking_domains[0]).toMatchObject({ status: "pending", errors: [] });
  });

  it("registers domains that were added before automatic setup was on", async () => {
    const legacy = await add("legacy.example.com", manual);
    expect(legacy.body.tracking_domain).toMatchObject({ status: "manual", dns_records: [] });

    const cf = mockCloudflare(() => ok(hostname("ch_legacy", "legacy.example.com", "pending", "initializing")));
    const listed = await list();
    expect(cf.calls).toEqual(["POST "]);
    expect(listed.body.tracking_domains[0]).toMatchObject({
      status: "pending",
      dns_records: [{ type: "CNAME", name: "legacy.example.com", value: "domains.capve.test" }],
    });
  });

  it("keeps the last state and shows the error when Cloudflare can't be reached", async () => {
    mockCloudflare(() => ok(hostname("ch_4", "down.example.com", "pending", "initializing")));
    await add("down.example.com");
    vi.restoreAllMocks();

    mockCloudflare(() => fail(500, 1000, "Internal error"));
    await expireChecks();
    const listed = await list();
    expect(listed.status).toBe(200);
    expect(listed.body.tracking_domains[0]).toMatchObject({ status: "pending", errors: ["Internal error"] });
  });

  it("deletes the Cloudflare hostname with the domain", async () => {
    mockCloudflare(() => ok(hostname("ch_5", "del.example.com", "active", "active")));
    const created = await add("del.example.com");
    vi.restoreAllMocks();

    mockCloudflare(() => fail(500, 1000, "Internal error"));
    const failed = await call(`/api/tracking-domains/${created.body.tracking_domain.id}`, { method: "DELETE" });
    expect(failed.status).toBe(502);
    expect((await list(manual)).body.tracking_domains).toHaveLength(1);
    vi.restoreAllMocks();

    // The failed removal is undone: status checks save again.
    mockCloudflare(() => ok(hostname("ch_5", "del.example.com", "active", "active")));
    await expireChecks();
    await list();
    const [kept] = await listTrackingDomains(env.DB, accountId);
    expect(kept).toMatchObject({ deleting_at: null, cf_status: "active" });
    expect(kept.checked_at).toBeGreaterThan(0);
    vi.restoreAllMocks();

    const cf = mockCloudflare(() => fail(404, 1436, "Custom hostname not found."));
    const removed = await call(`/api/tracking-domains/${created.body.tracking_domain.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect(cf.calls).toEqual(["DELETE /ch_5"]);
    expect((await list(manual)).body.tracking_domains).toEqual([]);
  });
});

describe("manual tracking domain setup", () => {
  it("never calls Cloudflare without the full configuration", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const partial: Env = { ...automatic, TRACKING_DOMAIN_API_TOKEN: undefined };
    const created = await add("hand.example.com", partial);
    expect(created.status).toBe(201);
    expect(created.body.tracking_domain).toMatchObject({ status: "manual", dns_records: [], errors: [] });
    const listed = await list(partial);
    expect(listed.body.automatic).toBe(false);
    // Subdomains of the app host stay allowed when domains are set up by hand.
    expect((await add("track.capve.test", partial)).status).toBe(201);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("domain status", () => {
  it("maps Cloudflare hostname and certificate states", () => {
    const status = (cf_status: string | null, cf_ssl_status: string | null, cf_hostname_id: string | null = "ch") =>
      domainStatus({ cf_hostname_id, cf_status, cf_ssl_status });
    expect(status(null, null, null)).toBe("manual");
    expect(status("active", "active")).toBe("active");
    expect(status("pending", "pending_validation")).toBe("pending");
    expect(status("active", "pending_issuance")).toBe("pending");
    expect(status("moved", "active")).toBe("failed");
    expect(status("blocked", "pending_validation")).toBe("failed");
    expect(status("pending", "validation_timed_out")).toBe("failed");
  });

  it("needs the zone, token and target", () => {
    expect(hostnameSetup(automatic)).toEqual({ zoneId: ZONE, token: "cf-test-token", target: "domains.capve.test" });
    expect(hostnameSetup({ ...automatic, TRACKING_DOMAIN_CNAME_TARGET: " " })).toBeNull();
    expect(hostnameSetup({})).toBeNull();
  });
});
