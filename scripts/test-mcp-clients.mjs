import { testMcpOAuth } from "./test-mcp-oauth.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client as ModernClient, StreamableHTTPClientTransport as ModernTransport } from "@modelcontextprotocol/client";

// All service data and database writes stay in a disposable local Worker.
// --external also runs third-party clients; their temporary profiles are removed below.
const external = process.argv.includes("--external");
const state = await mkdtemp(join(tmpdir(), "capve-mcp-clients-"));
const wrangler = "node_modules/wrangler/bin/wrangler.js";
const config = ["--config", "wrangler.vitest.toml", "--persist-to", state];
const processes = new Set();
const manufactProfiles = new Set();
const serverIcons = [{ src: "https://capve.app/logo.svg", mimeType: "image/svg+xml", sizes: ["any"] }];
const manufactCommand = ["exec", "--yes", "--package", "mcp-use@2.12.4", "--package", "@mcp-use/cli@5.1.0",
  "--package", "@mcp-use/client@2.4.5", "--", "mcp-use", "client"];
let token = "";
let bridge;
let client;

function start(command, args) {
  const child = spawn(command, args, {
    detached: true,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false", MCP_USE_ANONYMIZED_TELEMETRY: "false", DO_NOT_TRACK: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  processes.add(child);
  let output = "";
  child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-2_000_000); });
  child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-2_000_000); });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      processes.delete(child);
      code === 0 ? resolve(output) : reject(new Error(
        `${command} exited (${code ?? signal}): ${token ? output.replaceAll(token, "[redacted]") : output}`,
      ));
    });
  });
  // A persistent dev process is stopped in finally rather than awaited immediately.
  done.catch(() => {});
  return { child, done };
}

async function run(command, args) {
  const { child, done } = start(command, args);
  const timeout = setTimeout(() => stop(child), 180_000);
  try { return await done; } finally { clearTimeout(timeout); }
}

function stop(child) {
  try { process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function jsonLine(output) {
  for (const line of output.trim().split("\n").reverse()) {
    try { return JSON.parse(line); } catch { /* CLI status line */ }
  }
  throw new Error("External client did not return a JSON result");
}

try {
  console.log("Preparing isolated local D1 database...");
  await run("node", [wrangler, "d1", "migrations", "apply", "velo-db", "--local", ...config]);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = start("node", [wrangler, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), ...config]);
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.child.exitCode !== null) await server.done;
    try { ready = (await fetch(`${base}/api/health`)).ok; } catch { /* starting */ }
    if (ready) break;
    await delay(200);
  }
  assert(ready, "Local Worker did not become ready within 30 seconds");

  const registration = await fetch(`${base}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `mcp-${crypto.randomUUID()}@example.com`,
      password: crypto.randomUUID(), name: "Disposable MCP test",
    }),
  });
  assert(registration.ok, `Local registration failed (${registration.status})`);
  const cookie = registration.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  const created = await fetch(`${base}/api/tokens`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Disposable interoperability test" }),
  });
  assert(created.ok, `Local token creation failed (${created.status})`);
  ({ token } = await created.json());
  assert.match(token, /^capve_/);

  client = new Client({ name: "capve-interop-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  assert.equal(client.getServerVersion()?.name, "capve");
  assert.deepEqual(client.getServerVersion()?.icons, serverIcons);
  assert(client.getServerCapabilities()?.tools);
  await client.ping();
  const { tools } = await client.listTools();
  assert.equal(new Set(tools.map((tool) => tool.name)).size, tools.length);
  assert(tools.length > 0);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object", `${tool.name}: inputSchema`);
    assert.equal(tool.outputSchema?.type, "object", `${tool.name}: outputSchema`);
    assert.equal(typeof tool.annotations?.readOnlyHint, "boolean", `${tool.name}: readOnlyHint`);
  }
  for (const name of ["whoami", "list_campaigns", "get_settings", "get_billing_status"]) {
    const result = await client.callTool({ name, arguments: {} });
    assert.notEqual(result.isError, true, `${name} failed`);
    assert(result.structuredContent, `${name} has no structuredContent`);
    assert.deepEqual(JSON.parse(result.content.find((item) => item.type === "text").text), result.structuredContent);
  }
  const missing = await client.callTool({ name: "get_campaign", arguments: {} });
  assert.equal(missing.isError, true);
  await assert.rejects(client.callTool({ name: "unknown_capve_tool", arguments: {} }), /Unknown tool/);
  console.log(`SDK: initialized, verified scalable server icon, pinged, validated ${tools.length} tools, called 4 reads, checked 2 errors.`);
  await client.close();
  client = undefined;

  client = new ModernClient({ name: "capve-modern-interop-test", version: "1.0.0" }, {
    versionNegotiation: { mode: { pin: "2026-07-28" } },
  });
  await client.connect(new ModernTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  assert(client.getDiscoverResult()?.supportedVersions.includes("2026-07-28"));
  assert.equal(client.getServerVersion()?.name, "capve");
  assert.deepEqual(client.getServerVersion()?.icons, serverIcons);
  assert.equal((await client.listTools()).tools.length, tools.length);
  for (const name of ["whoami", "list_campaigns", "get_settings", "get_billing_status"]) {
    const result = await client.callTool({ name, arguments: {} });
    assert.notEqual(result.isError, true, `Modern ${name} failed`);
    assert(result.structuredContent, `Modern ${name} has no structuredContent`);
  }
  console.log(`SDK v2: discovered 2026-07-28, verified scalable server icon, validated ${tools.length} tools, called 4 reads.`);
  await client.close();
  client = undefined;

  await testMcpOAuth(base, cookie);

  if (external) {
    for (const mode of ["legacy", "auto", "modern"]) {
      // Manufact's CLI has no alternate config directory. A unique profile is
      // removed after each test (and retried in finally), preserving existing entries.
      const name = `capve-test-${mode}-${crypto.randomUUID()}`;
      manufactProfiles.add(name);
      await run("npm", [...manufactCommand, "connect", name, `${base}/mcp`, "--protocol", mode,
        "--no-oauth", "-H", `Authorization: Bearer ${token}`, "--json"]);
      const catalog = jsonLine(await run("npm", [...manufactCommand, name, "tools", "list", "--json"]));
      assert.equal(catalog.length, tools.length);
      for (const tool of ["whoami", "list_campaigns"]) {
        const result = jsonLine(await run("npm", [...manufactCommand, name, "tools", "call", tool, "--json"]));
        assert.notEqual(result.isError, true, `Manufact ${mode} ${tool} failed`);
        assert(result.structuredContent);
      }
      await run("npm", [...manufactCommand, "remove", name, "--json"]);
      manufactProfiles.delete(name);
      console.log(`Manufact mcp-use 2.12.4/client 2.4.5 (${mode}): discovered ${catalog.length} tools, called 2 reads.`);
    }
    for (const method of ["tools/list", "tools/call"]) {
      const outputFile = join(state, method === "tools/list" ? "inspector-tools.json" : "inspector-call.json");
      const args = ["exec", "--yes", "--package", "@modelcontextprotocol/inspector@2.15.0", "--", "mcp-inspector",
        "--cli", `${base}/mcp`, "--transport", "http", "--method", method,
        "--format", "json", "--output", outputFile, "--header", `Authorization: Bearer ${token}`];
      if (method === "tools/call") args.push("--tool-name", "whoami");
      else args.push("--strict");
      const diagnostics = await run("npm", args);
      assert(!diagnostics.includes("Warning: tool"), "Inspector reported tool-schema portability warnings");
      const output = JSON.parse(await readFile(outputFile, "utf8"));
      assert(method === "tools/list" ? output.tools?.length > 0 : output.content?.length > 0, `Inspector ${method}: missing result`);
      if (method === "tools/call") {
        assert.notEqual(output.isError, true, "Inspector whoami returned a tool error");
        assert.equal(typeof output.structuredContent?.user?.id, "string", "Inspector whoami: missing user identity");
      }
      console.log(`Inspector 2.15.0: ${method}${method === "tools/call" ? " whoami" : ""} passed.`);
    }

    // Conformance 0.1.16 has no custom auth-header option. This loopback-only bridge
    // supplies the disposable local token; request payloads and responses are unchanged.
    bridge = createServer(async (request, response) => {
      try {
        if (request.url !== "/mcp") { response.writeHead(404).end(); return; }
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const requestHeaders = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
          if (value !== undefined && !["host", "connection", "content-length", "transfer-encoding"].includes(name)) {
            requestHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
          }
        }
        const bridgeOrigin = `http://127.0.0.1:${bridge.address().port}`;
        if (requestHeaders.get("origin") === bridgeOrigin) requestHeaders.set("origin", base);
        requestHeaders.set("Authorization", `Bearer ${token}`);
        const upstream = await fetch(`${base}/mcp`, {
          method: request.method, headers: requestHeaders, redirect: "manual",
          body: ["GET", "HEAD"].includes(request.method) ? undefined : Buffer.concat(chunks),
        });
        const responseHeaders = new Headers(upstream.headers);
        for (const name of ["content-length", "content-encoding", "transfer-encoding", "connection"]) responseHeaders.delete(name);
        response.writeHead(upstream.status, Object.fromEntries(responseHeaders));
        response.end(Buffer.from(await upstream.arrayBuffer()));
      } catch { response.writeHead(502).end("Local test bridge failed"); }
    });
    await new Promise((resolve) => bridge.listen(0, "127.0.0.1", resolve));
    const bridgeUrl = `http://127.0.0.1:${bridge.address().port}/mcp`;
    const resultsDir = join(state, "conformance");
    // Remaining upstream scenarios require SDK fixture tools/features Capve does not expose.
    for (const scenario of ["server-initialize", "ping", "tools-list", "dns-rebinding-protection"]) {
      await run("npm", ["exec", "--yes", "--package", "@modelcontextprotocol/conformance@0.1.16", "--", "conformance",
        "server", "--url", bridgeUrl, "--scenario", scenario, "--output-dir", resultsDir]);
      console.log(`Conformance 0.1.16: ${scenario} passed.`);
    }
    let checks = 0;
    for (const folder of await readdir(resultsDir)) {
      const results = JSON.parse(await readFile(join(resultsDir, folder, "checks.json"), "utf8"));
      checks += results.filter((check) => check.status === "SUCCESS").length;
      assert(!results.some((check) => check.status === "FAILURE"), `${folder}: failed conformance check`);
    }
    console.log(`Official conformance: ${checks} successful checks across 4 applicable scenarios.`);

    for (const version of ["2025-03-26", "2025-06-18", "2025-11-25", "2026-07-28"]) {
      const output = await run("npm", ["exec", "--yes", "--package", "@mcpjam/cli@6.2.2", "--", "mcpjam",
        "--no-telemetry", "--format", "json", "protocol", "conformance", "--url", `${base}/mcp`, "--access-token", token,
        "--protocol-version", version, "--fixture-tool", "whoami", "--fixture-tool", "get_settings",
        "--fixture-tool", "list_campaigns"]);
      // npm can prepend an engine warning on stderr; the result itself is a JSON object.
      const jsonStart = output.indexOf('{"');
      const jsonEnd = output.lastIndexOf("}");
      const result = JSON.parse(output.slice(jsonStart, jsonEnd + 1));
      assert.equal(result.passed, true, `MCPJam ${version} failed`);
      console.log(`MCPJam 6.2.2 (${version}): ${result.summary}`);
    }
  }
  console.log("MCP interoperability checks passed; removing local fixtures.");
} finally {
  await client?.close().catch(() => {});
  for (const name of manufactProfiles) {
    await run("npm", [...manufactCommand, "remove", name, "--json"]).catch((error) => {
      console.error(`Could not remove temporary Manufact profile ${name}: ${error.message}`);
    });
  }
  if (bridge) await new Promise((resolve) => bridge.close(resolve));
  for (const child of processes) stop(child);
  await delay(300);
  await rm(state, { recursive: true, force: true });
}
