/** MCP 2026-07-28 per-request metadata; legacy handshake handling stays in server.ts. */
export const MODERN_PROTOCOL_VERSION = "2026-07-28";
const PREFIX = "io.modelcontextprotocol/";
const VERSION = `${PREFIX}protocolVersion`;
const CAPABILITIES = `${PREFIX}clientCapabilities`;
const INFO = `${PREFIX}clientInfo`;
const CACHEABLE_METHODS = new Set([
  "server/discover", "tools/list", "prompts/list", "resources/list",
  "resources/read", "resources/templates/list",
]);

type Message = { id?: string | number; method: string; params?: unknown };
type ServerInfo = { name: string; version: string; [key: string]: unknown };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isModernMcpRequest(
  request: Request,
  message: Message,
  legacyVersions: readonly string[],
): boolean {
  const header = request.headers.get("MCP-Protocol-Version");
  const meta = object(message.params) && object(message.params._meta) ? message.params._meta : {};
  return message.method === "server/discover"
    || (header !== null && !legacyVersions.includes(header))
    || (typeof meta[VERSION] === "string" && !legacyVersions.includes(meta[VERSION] as string));
}

function failure(message: Message, code: number, text: string, data?: unknown): Response {
  return Response.json({
    jsonrpc: "2.0",
    ...(message.id === undefined ? {} : { id: message.id }),
    error: { code, message: text, ...(data === undefined ? {} : { data }) },
  }, { status: 400 });
}

function validCapabilities(value: Record<string, unknown>): boolean {
  for (const name of ["experimental", "roots", "sampling", "elicitation", "extensions"]) {
    if (name in value && !object(value[name])) return false;
  }
  for (const [name, fields] of [["sampling", ["context", "tools"]], ["elicitation", ["form", "url"]]] as const) {
    const capability = value[name];
    if (object(capability) && fields.some((field) => field in capability && !object(capability[field]))) return false;
  }
  for (const name of ["experimental", "extensions"]) {
    const map = value[name];
    if (!object(map)) continue;
    if (Object.values(map).some((settings) => !object(settings))) return false;
    if (name === "extensions" && Object.keys(map).some((key) =>
      !/^[a-zA-Z](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9_.-]*[a-zA-Z0-9])?)?$/.test(key))) return false;
  }
  return true;
}

function decodedName(value: string): string | null {
  if (!/^[\t\x20-\x7e]*$/.test(value)) return null;
  if (!value.startsWith("=?base64?") || !value.endsWith("?=")) return value;
  const encoded = value.slice(9, -2);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

/** Returns a protocol error response, or null when the modern request is valid. */
export function validateModernMcpRequest(
  request: Request,
  message: Message,
  supportedVersions: readonly string[],
): Response | null {
  const params = object(message.params) ? message.params : {};
  const meta = object(params._meta) ? params._meta : {};
  if (typeof meta[VERSION] !== "string" || !object(meta[CAPABILITIES])) {
    return failure(message, -32602, "Modern requests require protocolVersion and clientCapabilities in params._meta.");
  }
  if (!validCapabilities(meta[CAPABILITIES] as Record<string, unknown>)) {
    return failure(message, -32602, "Invalid clientCapabilities in params._meta.");
  }
  const info = meta[INFO];
  if (info !== undefined && (!object(info) || typeof info.name !== "string" || typeof info.version !== "string")) {
    return failure(message, -32602, "clientInfo must contain a name and version.");
  }
  const logLevel = meta[`${PREFIX}logLevel`];
  if (logLevel !== undefined && (typeof logLevel !== "string" || !["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"].includes(logLevel))) {
    return failure(message, -32602, "Invalid logLevel in params._meta.");
  }
  const version = meta[VERSION] as string;
  if (request.headers.get("MCP-Protocol-Version") !== version) {
    return failure(message, -32020, "MCP-Protocol-Version header must match params._meta protocolVersion.");
  }
  if (request.headers.get("Mcp-Method") !== message.method) {
    return failure(message, -32020, "Mcp-Method header must match the request method.");
  }
  const nameKey = message.method === "resources/read" ? "uri"
    : ["tools/call", "prompts/get"].includes(message.method) ? "name" : null;
  if (nameKey) {
    const header = request.headers.get("Mcp-Name");
    if (typeof params[nameKey] !== "string") return failure(message, -32602, `${nameKey} must be a string.`);
    if (header === null || decodedName(header) !== params[nameKey]) {
      return failure(message, -32020, `Mcp-Name header must match params.${nameKey}.`);
    }
  }
  if (version !== MODERN_PROTOCOL_VERSION) {
    return failure(message, -32022, "Unsupported protocol version", { requested: version, supported: supportedVersions });
  }
  return null;
}

export function modernResult(value: Record<string, unknown>, method: string, serverInfo: ServerInfo) {
  return {
    ...value,
    resultType: "complete",
    _meta: { ...(object(value._meta) ? value._meta : {}), [`${PREFIX}serverInfo`]: serverInfo },
    ...(CACHEABLE_METHODS.has(method) ? { ttlMs: 0, cacheScope: "private" } : {}),
  };
}

export function discoveryResult(supportedVersions: readonly string[], serverInfo: ServerInfo, instructions: string) {
  return modernResult({
    supportedVersions,
    capabilities: { tools: {} },
    instructions,
  }, "server/discover", serverInfo);
}
