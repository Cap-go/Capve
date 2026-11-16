import { BIDDING_DEFAULTS, BIDDING_MODEL, type BiddingConfig, type BidDecision } from "../../shared/bidding";
import type { Env } from "../types";

export class BiddingError extends Error {
  constructor(message: string, public status: 400 | 409 | 429 | 502 | 503 = 400) { super(message); }
}

export function parseBiddingConfig(value: unknown): BiddingConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BiddingError("Settings must be an object");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((k) => !Object.hasOwn(BIDDING_DEFAULTS, k))) throw new BiddingError("Unknown bidding setting");
  if (typeof v.enabled !== "boolean") throw new BiddingError("enabled must be a boolean; the beta requires explicit opt-in");
  const config = { ...BIDDING_DEFAULTS, ...v } as BiddingConfig;
  if (typeof config.dimension !== "string" || !/^sub([1-9]|10)$/.test(config.dimension)) throw new BiddingError("Choose a zone parameter from sub1 to sub10");
  if (!["USD", "EUR"].includes(config.currency)) throw new BiddingError("Confirm spend currency: USD or EUR");
  const limits = {
    window_hours: [1, 720], conversion_lag_hours: [1, 168], min_clicks: [10, 1000000],
    min_spend_cents: [1, 100000000], min_conversions: [1, 1000000], target_roi: [0, 1000], max_change_pct: [1, 20],
  } as const;
  for (const [key, [min, max]] of Object.entries(limits)) {
    const n = config[key as keyof typeof limits];
    if (!Number.isInteger(n) || n < min || n > max) throw new BiddingError(`${key} must be an integer between ${min} and ${max}`);
  }
  return config;
}

export type ZoneEvidence = {
  zone: string; clicks: number; conversions: number; cost_cents: number; revenue_cents: number;
  unknown_costs: number; foreign_revenue: number;
};

export function ruleDecision(row: ZoneEvidence, config: BiddingConfig): BidDecision {
  const roi = row.cost_cents > 0 ? (row.revenue_cents / row.cost_cents - 1) * 100 : null;
  const base = { zone: row.zone, clicks: row.clicks, conversions: row.conversions,
    cost_cents: row.cost_cents, revenue_cents: row.revenue_cents, roi, change_pct: 0 };
  if (row.unknown_costs || row.foreign_revenue) return { ...base, reason: "Hold: missing costs or mismatched revenue currency." };
  if (row.clicks < config.min_clicks || row.cost_cents < config.min_spend_cents || roi === null) {
    return { ...base, reason: "Hold: minimum clicks and spend not reached." };
  }
  // A ten-point dead band avoids reacting to small fluctuations around target ROI.
  if (roi < config.target_roi - 10) return { ...base, change_pct: -config.max_change_pct, reason: "ROI below target after conversion delay." };
  if (roi > config.target_roi + 10 && row.conversions >= config.min_conversions) {
    return { ...base, change_pct: config.max_change_pct, reason: "ROI above target with enough converted clicks." };
  }
  return { ...base, reason: "Hold: near target ROI or insufficient conversions to increase." };
}

export async function modelDecisions(ai: NonNullable<Env["AI"]>, decisions: BidDecision[]): Promise<BidDecision[]> {
  const candidates = decisions.map((d, index) => ({ d, index })).filter(({ d }) => d.change_pct !== 0);
  if (!candidates.length) return decisions;
  // Raw zone values (untrusted URL parameters), customer identifiers and visitor data never enter the prompt.
  const evidence = candidates.map(({ d, index }) => ({ id: index, clicks: d.clicks, conversions: d.conversions,
    spend: d.cost_cents, revenue: d.revenue_cents, roi: d.roi, allowed_change_pct: d.change_pct }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let output: unknown;
  try {
    output = await Promise.race([
      ai.run(BIDDING_MODEL, {
        messages: [
          { role: "system", content: 'Review bidding candidates using only supplied aggregate evidence. Return JSON {"decisions":[{"id":0,"change_pct":0,"reason":"brief explanation"}]}. Return exactly one entry per supplied id. You may hold (0) or reduce the magnitude of allowed_change_pct; never reverse direction or exceed it. Prefer holding when evidence is weak. Never claim profit is guaranteed.' },
          { role: "user", content: JSON.stringify(evidence) },
        ],
        stream: false, temperature: 0, max_completion_tokens: 4096,
        chat_template_kwargs: { enable_thinking: false },
        response_format: { type: "json_object" },
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 25000); }),
    ]);
  } catch { throw new BiddingError("Decision model unavailable. No recommendations saved; try again later.", 502); }
  finally { clearTimeout(timer); }
  try {
    const envelope = output as { choices?: { message?: { content?: unknown }; finish_reason?: string }[] };
    const choice = envelope.choices?.[0];
    if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string" || choice.message.content.length > 50000) throw new Error();
    const parsed = JSON.parse(choice.message.content) as { decisions?: unknown };
    if (!Array.isArray(parsed.decisions) || parsed.decisions.length !== candidates.length) throw new Error();
    const result = decisions.map((d) => ({ ...d }));
    const seen = new Set<number>();
    for (const item of parsed.decisions) {
      if (!item || typeof item !== "object") throw new Error();
      const { id, change_pct, reason } = item;
      const candidate = candidates.find((c) => c.index === id);
      if (!candidate || seen.has(id) || !Number.isInteger(change_pct) || typeof reason !== "string" || !reason.trim() || reason.length > 240) throw new Error();
      const allowed = candidate.d.change_pct;
      if (Math.abs(change_pct) > Math.abs(allowed) || (change_pct !== 0 && Math.sign(change_pct) !== Math.sign(allowed))) throw new Error();
      seen.add(id);
      result[id] = { ...result[id], change_pct, reason: reason.trim() };
    }
    return result;
  } catch { throw new BiddingError("Decision model returned an invalid recommendation. Nothing was saved.", 502); }
}
