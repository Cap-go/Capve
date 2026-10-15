import { TOOLS, TOOLS_BY_NAME, ToolInputError, type ApiCall } from "./tools";

/**
 * Stateless MCP server (Streamable HTTP, JSON responses only).
 * Every tool maps to an existing /api route and runs with the caller's bearer token,
 * so permissions, validation and ownership checks are exactly the dashboard's.
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "capve", title: "Capve", version: "1.0.0" };
const INSTRUCTIONS =
  "Capve is an open-source campaign and affiliate tracker (Binom alternative). " +
  "Campaigns send visitors through paths (direct URL, lander, offer) chosen by a rotation. " +
  "Use list_campaigns first to find ids. Money values are integer cents. " +
  "Conversions can carry an event (registration, ftd, ...); outgoing postbacks (create_postback) can be limited to one event. " +
  "Report dates accept ISO dates or Unix milliseconds.";

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc: "2.0"; id?: JsonRpcId; method: string; params?: unknown };

export type ApiDispatch = (call: ApiCall) => Promise<Response>;

function result(id: JsonRpcId, value: unknown) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isRequest(value: unknown): value is JsonRpcRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    typeof (value as { method?: unknown }).method === "string"
  );
}

async function callTool(params: unknown, dispatch: ApiDispatch) {
  const { name, arguments: args } = (params ?? {}) as { name?: string; arguments?: unknown };
  const tool = name ? TOOLS_BY_NAME.get(name) : undefined;
  if (!tool) return null;

  let call: ApiCall;
  try {
    call = tool.call((args ?? {}) as Record<string, unknown>);
  } catch (err) {
    if (err instanceof ToolInputError) return toolText(err.message, true);
    throw err;
  }

  const response = await dispatch(call);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON body; return as-is
  }
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : text || response.statusText;
    return toolText(`Error ${response.status}: ${message}`, true);
  }
  return {
    content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
    structuredContent: typeof body === "object" && body !== null && !Array.isArray(body) ? body : { result: body },
    isError: false,
  };
}

function toolText(text: string, isError: boolean) {
  return { content: [{ type: "text", text }], isError };
}

async function handleMessage(message: unknown, dispatch: ApiDispatch) {
  if (!isRequest(message)) return error(null, -32600, "Invalid Request");
  const id = message.id;
  const isNotification = id === undefined;

  switch (message.method) {
    case "initialize": {
      const requested = (message.params as { protocolVersion?: string } | undefined)?.protocolVersion;
      const protocolVersion =
        requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0];
      return result(id ?? null, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return isNotification ? null : result(id, {});
    case "tools/list":
      return result(id ?? null, {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations: { title, ...annotations, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const output = await callTool(message.params, dispatch);
      if (!output) return error(id ?? null, -32602, "Unknown tool");
      return result(id ?? null, output);
    }
    case "resources/list":
      return result(id ?? null, { resources: [] });
    case "prompts/list":
      return result(id ?? null, { prompts: [] });
    default:
      if (isNotification) return null;
      return error(id, -32601, `Method not found: ${message.method}`);
  }
}

export async function handleMcpRequest(request: Request, dispatch: ApiDispatch): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(error(null, -32700, "Parse error"), { status: 400 });
  }

  if (Array.isArray(payload)) {
    const replies = (await Promise.all(payload.map((m) => handleMessage(m, dispatch)))).filter(
      (reply) => reply !== null,
    );
    return replies.length ? Response.json(replies) : new Response(null, { status: 202 });
  }

  const reply = await handleMessage(payload, dispatch);
  return reply ? Response.json(reply) : new Response(null, { status: 202 });
}
