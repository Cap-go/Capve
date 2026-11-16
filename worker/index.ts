import { discovery, oauth } from "./routes/oauth";
import { oauthIssuer, OAUTH_SCOPE, registeredOAuthOrigin } from "./lib/oauth";
import { billing } from "./routes/billing";
import { requireReports } from "./lib/billing";
import { Hono } from "hono";
import type { Env } from "./types";
import { accounts } from "./routes/accounts";
import { admin } from "./routes/admin";
import { antifraud } from "./routes/antifraud";
import { auth } from "./routes/auth";
import { convert } from "./routes/convert";
import { entities } from "./routes/entities";
import { postback } from "./routes/postback";
import { postbacks } from "./routes/postbacks";
import { programs } from "./routes/programs";
import { ops } from "./routes/ops";
import { reports } from "./routes/reports";
import { campaign, lp, redirect } from "./routes/redirect";
import { routing } from "./routes/routing";
import { campaignCosts, sources } from "./routes/sources";
import { tokens } from "./routes/tokens";
import { auditMutation } from "./lib/audit";
import { readBearerToken, requireUser } from "./lib/access";
import type { SessionUser } from "./types-ops";
import { handleMcpRequest } from "./mcp/server";
import { bidding } from "./routes/bidding";
import { automation } from "./routes/automation";
import { drilldown } from "./routes/drilldown";
import { settings } from "./routes/settings";
import { trackingDomains } from "./routes/tracking-domains";
import { hostGate, isAppHost } from "./lib/host-gate";
import { runScheduled } from "./cron";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
});

// MCP requires 403 for invalid Origins, even before host routing or authentication.
app.use("/mcp", async (c, next) => {
  const origin = c.req.header("Origin");
  const url = new URL(c.req.url);
  if (origin !== undefined && (!isAppHost(url.hostname, c.env) || (origin !== url.origin && !(await registeredOAuthOrigin(c.env.DB, origin))))) {
    return c.json({ jsonrpc: "2.0", error: { code: -32000, message: "Forbidden origin" } }, 403);
  }
  const cors = () => {
    if (!origin) return;
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id, Mcp-Method, Mcp-Name");
    c.header("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Session-Id");
  };
  if (origin && c.req.method === "OPTIONS") {
    cors();
    return c.body(null, 204);
  }
  await next();
  cors();
});

// Custom tracking domains serve only /r, /c, /lp, /click; unknown hosts get 404.
app.use("*", hostGate);

app.use("/api/*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  const audits = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  // Read the actor first. logout-all bumps session_version inside the handler,
  // so a lookup after next() no longer sees this request's session.
  let actor: SessionUser | null = null;
  if (audits) {
    try {
      actor = await requireUser(c);
    } catch {
      actor = null;
    }
  }
  await next();
  if (!audits || !actor) return;
  if (c.res.status < 200 || c.res.status >= 300) return;
  await auditMutation(c.env.DB, actor, method, new URL(c.req.url).pathname, {
    viaApi: Boolean(c.req.header("authorization")),
  });
});

app.route("/.well-known", discovery);
app.route("/oauth", oauth);

app.get("/api/health", (c) => c.json({ ok: true, service: "capve" }));

// Cover chart/report data, raw logs and exports, including MCP requests replayed through /api.
app.use("/api/reports/*", requireReports);
for (const prefix of ["/api/programs", "/api/campaigns"]) {
  for (const suffix of ["stats", "clicks", "conversions"]) app.use(`${prefix}/:id/${suffix}`, requireReports);
}
app.route("/api/billing", billing);
app.route("/api/auth", accounts);
app.route("/api/auth", auth);
app.route("/api/admin", admin);
app.route("/api/antifraud", antifraud);
app.route("/api/entities", entities);
app.route("/api/programs", programs);
app.route("/api/programs", routing);
app.route("/api/campaigns", programs);
app.route("/api/campaigns", routing);
app.route("/api/programs", campaignCosts);
app.route("/api/campaigns", campaignCosts);
app.route("/api/sources", sources);
app.route("/api/v1/convert", convert);
app.route("/api/ops", ops);
app.route("/api/reports/drilldown", drilldown);
app.route("/api/reports", reports);
app.route("/api/settings", settings);
app.route("/api/automation", automation);
app.route("/api/bidding", bidding);
app.route("/api/tracking-domains", trackingDomains);
app.route("/api/tokens", tokens);
app.route("/api/postbacks", postbacks);
app.route("/r", redirect);
app.route("/c", campaign);
app.route("/lp", lp);
app.route("/click", postback);

// MCP server: every tool replays an /api request with the caller's bearer token.
app.all("/mcp", async (c) => {
  const authorization = c.req.header("authorization");
  if (!readBearerToken(authorization) || !(await requireUser(c))) {
    return c.json({ error: "Sign in with OAuth or use a Capve API token." }, 401, {
      'WWW-Authenticate': `Bearer realm="capve", resource_metadata="${oauthIssuer(c.env, c.req.url)}/.well-known/oauth-protected-resource/mcp", scope="${OAUTH_SCOPE}"${authorization ? ', error="invalid_token"' : ""}`,
    });
  }
  const origin = new URL(c.req.url).origin;
  return handleMcpRequest(c.req.raw, ({ method, path, query, body }) => {
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    return Promise.resolve(
      app.fetch(
        new Request(url, {
          method,
          headers: { authorization: authorization!, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        c.env,
        c.executionCtx,
      ),
    );
  }, c.req.header("Origin")); // The /mcp middleware has validated this registered origin.
});

import { ATTRIBUTION_SNIPPET } from "./lib/urls";

app.get("/api/v1/snippet", (c) => {
  return c.text(ATTRIBUTION_SNIPPET, 200, {
    "Content-Type": "text/javascript; charset=utf-8",
  });
});

// The home page is prerendered to home.html (scripts/prerender.tsx); index.html stays the empty
// SPA shell that Cloudflare serves for /app and other client routes.
app.get("/", (c) => {
  const assets = c.env.ASSETS;
  if (!assets) return c.text("Capve API running. Build the frontend with `bun run build`.", 404);
  return assets.fetch(new Request(new URL("/home", c.req.url), c.req.raw));
});
app.get("/home", (c) => c.redirect("/", 301));

app.all("*", async (c) => {
  const assets = c.env.ASSETS;
  if (!assets) {
    return c.text("Capve API running. Build the frontend with `bun run build`.", 404);
  }
  return assets.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  /** Cron triggers (wrangler.toml [triggers]) dispatched by worker/cron/index.ts. */
  scheduled: runScheduled,
} satisfies ExportedHandler<Env>;
