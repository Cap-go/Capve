/** Code samples for docs and dashboard — keep in sync with worker/routes/convert.ts */

export function snippetScriptTag(appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `<script src="${base}/api/v1/snippet" async></script>`;
}

export function stripeCheckoutMetadataExample(): string {
  return `// Read click_id from localStorage (set by Capve snippet after affiliate click-through)
const clickId =
  typeof window !== "undefined"
    ? window.localStorage.getItem("click_id") ||
      new URLSearchParams(window.location.search).get("click_id")
    : null;

const session = await stripe.checkout.sessions.create({
  mode: "payment",
  line_items: [{ price: "price_123", quantity: 1 }],
  success_url: "https://yourapp.com/success",
  metadata: {
    click_id: clickId ?? "",
  },
});`;
}

export function stripeWebhookConvertExample(appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `// Stripe webhook — checkout.session.completed
export async function onCheckoutCompleted(session) {
  const clickId = session.metadata?.click_id?.trim();
  if (!clickId) return;

  const orderId = session.id;
  const amount = (session.amount_total ?? 0) / 100;

  // Option A: Binom-style GET postback (no secret in URL)
  await fetch(
    \`${base}/click?cnv_id=\${encodeURIComponent(clickId)}&payout=\${amount}&cnv_status=sale&order_id=\${orderId}\`
  );

  // Option B: POST /api/v1/convert with campaign secret (server env only)
  // await fetch("${base}/api/v1/convert", { ... body: { order_id, amount, click_id: clickId } });
}`;
}

export function convertCurlExample(appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `curl -X POST "${base}/api/v1/convert" \\
  -H "Content-Type: application/json" \\
  -H "X-Program-Secret: sk_your_program_secret" \\
  -d '{
    "order_id": "in_2026_000145",
    "amount": 99.00,
    "click_id": "clk_from_redirect_url"
  }'`;
}

export function convertResponseExample(): string {
  return `{
  "ok": true,
  "status": "created",
  "conversion": {
    "affiliate_code": "abc123xyz",
    "click_id": "clk_from_redirect_url",
    "order_id": "in_2026_000145",
    "amount": 99,
    "amount_cents": 9900,
    "status": "lead",
    "currency": "USD"
  }
}`;
}
