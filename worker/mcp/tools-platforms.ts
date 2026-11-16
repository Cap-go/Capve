import { PLATFORM_IDS } from "../../shared/platforms";
import { ToolInputError, type ToolDefinition } from "./tools";
const schema = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object" as const, properties, required, additionalProperties: false });
const source = { type: "string", description: "Capve traffic-source ID from list_traffic_sources. The connection can manage campaigns in the provider account associated with its credential." };
const revision = { type: "integer", minimum: 0, description: "Current connection revision from get_platform_connection; prevents using a configuration that has since changed." };
const params = { type: "object", additionalProperties: true, description: "Action parameters matching input_schema from list_platform_integrations. Campaign IDs are external provider IDs, not Capve IDs. Amount units are specific to each provider/action." };
const action = { type: "string", description: "Supported action ID from this connection's provider in list_platform_integrations." };
const path = (args: Record<string, unknown>) => {
  if (typeof args.traffic_source_id !== "string" || !args.traffic_source_id.trim()) throw new ToolInputError("traffic_source_id is required");
  return `/api/platforms/sources/${encodeURIComponent(args.traffic_source_id)}`;
};
const body = ({ traffic_source_id: _, ...rest }: Record<string, unknown>) => rest;
export const PLATFORM_TOOLS: ToolDefinition[] = [
  {
    name: "list_platform_integrations", title: "List platform integrations",
    description: "Discover the opt-in beta integrations for Adcash, PropellerAds, RichAds and TrafficStars. Returns credential setup, limitations and supported action input schemas. All integrations start disabled. Read these capabilities before configuring a connection or requesting an action.",
    inputSchema: schema({}), annotations: { readOnlyHint: true }, call: () => ({ method: "GET", path: "/api/platforms" }),
  },
  {
    name: "get_platform_connection", title: "Get platform connection",
    description: "Read a traffic source's selected provider, enabled/write opt-ins, credential presence and revision. Credentials are never returned. No remote provider request is made.",
    inputSchema: schema({ traffic_source_id: source }), annotations: { readOnlyHint: true }, call: (a) => ({ method: "GET", path: path(a) }),
  },
  {
    name: "configure_platform_connection", title: "Configure platform connection",
    description: "Configure this traffic source's optional management API. Credentials are encrypted, separate from cost sync. Changing provider clears its saved credential; omission otherwise preserves it and null removes it. enabled permits remote reads; allow_writes explicitly permits live changes by console/MCP writers. Does not contact the provider. Returns settings with a new revision and no secret.",
    inputSchema: schema({ traffic_source_id: source, revision, provider: { type: "string", enum: [...PLATFORM_IDS], description: "Advertising account provider to connect." }, enabled: { type: "boolean", description: "Enable this beta connection. Requires a credential." }, allow_writes: { type: "boolean", description: "Allow explicit remote changes that may affect spend; leave false for inspection only." }, credential: { type: ["string", "null"], minLength: 1, maxLength: 4096, pattern: "^[^\\s]+$", description: "Management credential described in list_platform_integrations. Prefer entering it in the console; omission preserves it for the same provider, null removes it." } }, ["traffic_source_id", "revision", "provider", "enabled", "allow_writes"]),
    annotations: { readOnlyHint: false, destructiveHint: true }, call: (a) => ({ method: "PUT", path: path(a), body: body(a) }),
  },
  {
    name: "read_platform_data", title: "Read advertising platform data",
    description: "Call a supported read_only provider action using this traffic source's enabled connection. Returns result with provider, action, status, message and provider-specific data; credential fields are redacted. Check status before using data. Does not change campaigns.",
    inputSchema: schema({ traffic_source_id: source, revision, action, params }), annotations: { readOnlyHint: true, openWorldHint: true }, call: (a) => ({ method: "POST", path: `${path(a)}/read`, body: body(a) }),
  },
  {
    name: "execute_platform_action", title: "Change advertising platform campaign",
    description: "Execute a documented provider write action on an external campaign. Requires writer role plus enabled and allow_writes opt-ins. Can change live bids, budgets, delivery or exclusions and affect spend. Inspect provider capabilities, current campaign and amount units first. Supply a unique operation_id per intended change and reuse it for retries of the exact request. Returns accepted/failed/unknown, provider data and operation ID. Accepted is not read-back verification; read the campaign again. Unknown requests are never automatically resent; inspect provider state before another operation. AI recommendations are not automatically applied.",
    inputSchema: schema({ traffic_source_id: source, revision, action, params, operation_id: { type: "string", pattern: "^[a-zA-Z0-9_-]{16,80}$", description: "Unique identifier for this intended change, such as a UUID. Reuse with identical parameters if the call is interrupted, so the external action is not sent twice." } }),
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: true }, call: (a) => ({ method: "POST", path: `${path(a)}/execute`, body: body(a) }),
  },
  {
    name: "list_platform_operations", title: "List platform changes",
    description: "Read up to 50 recent remote changes for this traffic source, newest first. Returns operation ID, actor ID, provider, action, request parameters, creation time and result status/message (provider response data is omitted from history). A null result means pending or interrupted; inspect remote state before retrying with a new operation ID.",
    inputSchema: schema({ traffic_source_id: source }), annotations: { readOnlyHint: true }, call: (a) => ({ method: "GET", path: `${path(a)}/operations` }),
  },
];
