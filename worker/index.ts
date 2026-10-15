import { Hono } from "hono";
import type { Env } from "./types";
import { admin } from "./routes/admin";
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
import { tokens } from "./routes/tokens";
import { readBearerToken, requireUser } from "./lib/access";
import { handleMcpRequest } from "./mcp/server";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
});

app.get("/api/health", (c) => c.json({ ok: true, service: "capve" }));

app.route("/api/auth", auth);
app.route("/api/admin", admin);
app.route("/api/entities", entities);
app.route("/api/programs", programs);
app.route("/api/programs", routing);
app.route("/api/campaigns", programs);
app.route("/api/campaigns", routing);
app.route("/api/v1/convert", convert);
app.route("/api/ops", ops);
app.route("/api/reports", reports);
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
    return c.json({ error: "Missing or invalid API token. Create one in Capve → API & MCP." }, 401, {
      "WWW-Authenticate": 'Bearer realm="capve"',
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
  });
});

import { ATTRIBUTION_SNIPPET } from "./lib/urls";

app.get("/api/v1/snippet", (c) => {
  return c.text(ATTRIBUTION_SNIPPET, 200, {
    "Content-Type": "text/javascript; charset=utf-8",
  });
});

app.all("*", async (c) => {
  const assets = c.env.ASSETS;
  if (!assets) {
    return c.text("Capve API running. Build the frontend with `bun run build`.", 404);
  }
  return assets.fetch(c.req.raw);
});

export default app;
