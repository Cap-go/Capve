# Adcash Cost and Impressions Import

Capve can automatically import daily spend and impressions from Adcash (and other traffic sources) instead of relying only on per-click cost parameters. This ensures your reported costs match what the traffic source actually billed you.

## The problem

When traffic sources send clicks with a cost parameter (e.g., `cost=0.0011`), Capve sums those values. But visits that were billed by the source but never reached Capve (e.g., due to network issues, filtering, or bot detection) are missing. This creates a gap between:

- What Adcash billed you: €98.79 for 84,171 impressions
- What Capve reports: €70.62 for 59,275 clicks

The per-unit cost matches (~€0.0011), but the gap comes from impressions that never became Capve clicks.

## The solution

Capve now:

1. **Imports daily stats** from the Adcash API (or other sources): impressions and spend per campaign/zone per day
2. **Uses imported spend as the source of truth** when available: reports show the API-imported cost instead of summed click costs
3. **Shows impressions** alongside clicks in campaign reports and trends
4. **Falls back to click costs** when no import exists for a day

## Setup

### 1. Configure the traffic source API

1. Go to **Traffic Sources** → select your Adcash source
2. Under **Cost API**, select **Adcash**
3. Paste your Adcash API key (get it from your Adcash advertiser account)
4. Save

The API key is encrypted with `AUTH_SECRET` and never returned by the API.

### 2. Map external campaign IDs

Adcash reports stats per campaign ID (e.g., `459729072`). You need to tell Capve which Capve campaign each Adcash campaign ID belongs to.

**Via API:**

```bash
curl -X POST https://capve.app/api/sources/{source_id}/campaign-mappings \
  -H "Cookie: capve_session=..." \
  -H "Content-Type: application/json" \
  -d '{
    "program_id": "prg_3962871f25579c05",
    "external_campaign_id": "459729072"
  }'
```

**Via MCP (from Claude Desktop or another MCP client):**

```
Please map Adcash campaign 459729072 to Capve campaign prg_3962871f25579c05
```

### 3. Sync costs

The hourly cron (`worker/cron/`) automatically pulls spend from sources with a configured cost API.

**Manual sync (via API):**

```bash
curl -X POST https://capve.app/api/sources/{source_id}/sync-cost \
  -H "Cookie: capve_session=..." \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-11-16"}'
```

**Manual sync (via MCP):**

```
Please sync Adcash costs for today
```

Omit `date` to sync yesterday and today (default).

## How it works

### Cost precedence

When you view a campaign report:

1. **With daily stats**: Capve uses the imported spend from the Adcash API
   - `cost_source: "daily_stats"`
   - Shows impressions (if reported)
2. **Without daily stats**: Capve sums the per-click `cost` parameter
   - `cost_source: "clicks"`
   - No impressions shown

This is per (campaign, day). A campaign can have:
- Day 1: `cost_source: "daily_stats"` (API import exists)
- Day 2: `cost_source: "clicks"` (no import for that day)

### Impressions

When daily stats exist, reports show:
- **Campaign list**: total impressions for the date range
- **Trends**: impressions per day
- **Cost per impression** (calculated: `cost / impressions`)

### Timezone handling

- Adcash reports stats in **UTC**
- Capve stores daily stats by **UTC calendar day** (YYYY-MM-DD)
- Reports group by the account's timezone offset

If your account timezone is CET (UTC+1) and you view Nov 16 in your reports, Capve will include:
- Nov 15 23:00 UTC – Nov 16 22:59 UTC (clicks)
- Nov 16 UTC (daily stats)

For campaigns with high traffic near midnight, this can cause a small mismatch between clicks and imported stats.

### Campaign mapping

Without a mapping, the sync still runs and updates per-click costs (the fallback), but it doesn't store daily stats because it doesn't know which Capve campaign the external campaign ID belongs to.

**One external campaign → one Capve campaign.** If you split one Adcash campaign across multiple Capve campaigns (e.g., by country using routing rules), you cannot import daily stats at the per-campaign level. The sync will spread the spend over all matching clicks using the zone/campaign tokens as before.

## Database schema

### `traffic_source_daily_stats`

Stores imported spend and impressions per campaign per day.

```sql
CREATE TABLE traffic_source_daily_stats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  program_id TEXT NOT NULL,           -- Capve campaign
  traffic_source_id TEXT NOT NULL,
  date TEXT NOT NULL,                 -- UTC YYYY-MM-DD
  external_campaign_id TEXT,          -- Source's campaign ID
  external_zone_id TEXT,              -- Source's zone/placement ID
  impressions INTEGER NOT NULL,
  spend_cents INTEGER NOT NULL,
  origin TEXT NOT NULL DEFAULT 'api', -- 'api' or 'manual'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(program_id, date, external_campaign_id, external_zone_id)
);
```

### `traffic_source_campaign_mapping`

Maps external campaign IDs to Capve campaigns.

```sql
CREATE TABLE traffic_source_campaign_mapping (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  traffic_source_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  external_campaign_id TEXT NOT NULL, -- Adcash campaign_id, PropellerAds campaign_id, etc.
  created_at INTEGER NOT NULL,
  UNIQUE(traffic_source_id, external_campaign_id)
);
```

## API endpoints

- `GET /api/sources/:id/campaign-mappings` — list mappings for a source
- `POST /api/sources/:id/campaign-mappings` — create/update a mapping
  - Body: `{ "program_id": "prg_...", "external_campaign_id": "459729072" }`
- `DELETE /api/sources/:id/campaign-mappings/:mappingId` — delete a mapping

- `POST /api/sources/:id/sync-cost` — trigger a manual sync
  - Body: `{ "date": "2026-11-16" }` (optional; defaults to yesterday and today)

## Adding new traffic sources

To add support for another source (PropellerAds, RichAds, etc.):

1. Add a provider in `worker/cron/cost-providers.ts`:

```typescript
export const propelleradsProvider: CostProvider = {
  id: "propellerads",
  name: "PropellerAds",
  async fetchSpend(apiKey, range, fetchFn = fetch) {
    const url = new URL("https://api.propellerads.com/v1/stats");
    url.searchParams.set("date_from", range.from);
    url.searchParams.set("date_to", range.to);
    url.searchParams.set("group_by", "date,campaign,zone");
    
    const res = await fetchFn(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`PropellerAds API ${res.status}`);
    
    const { data } = await res.json();
    return data.map((row: any) => ({
      date: row.date,
      campaign_id: row.campaign_id,
      zone_id: row.zone_id,
      spend_cents: Math.round(row.cost * 100),
      impressions: row.impressions,
    }));
  },
};
```

2. Register it in `COST_PROVIDERS`:

```typescript
export const COST_PROVIDERS: Record<string, CostProvider> = {
  [adcashProvider.id]: adcashProvider,
  [propelleradsProvider.id]: propelleradsProvider,
};
```

3. Update the source template in `worker/lib/source-templates.ts`:

```typescript
{
  id: "propellerads",
  name: "PropellerAds",
  cost_type: "cpm",
  cost_api: "propellerads",
  tokens: [
    { param: "zoneid", name: "Zone", slot: "sub1", macro: "{zone_id}", kind: "zone" },
    { param: "campaignid", name: "Campaign", slot: "sub2", macro: "{campaign_id}", kind: "campaign" },
    { param: "country", name: "Country", slot: "sub4", macro: "{country}" },
    { param: "cost", name: "Cost", slot: "cost", macro: "{cost}" },
    { param: "clickid", name: "Click ID", slot: "external_id", macro: "${SUBID}" },
  ],
}
```

The `kind: "campaign"` and `kind: "zone"` tokens tell the sync which token carries the campaign/zone ID for matching spend rows to clicks.

## Limitations

- **Revenue is out of scope**: this feature only imports costs, not conversions or revenue
- **Manual imports**: no UI for uploading a CSV of daily stats (API only)
- **Adcash timezone**: Adcash reports in UTC; if your account timezone differs, there may be a small mismatch for clicks near midnight
- **Campaign splitting**: if you split one external campaign across multiple Capve campaigns (via routing rules), daily stats won't work at the per-campaign level

## Configuration

The Adcash API key must be set per traffic source (via the dashboard or API). It is stored encrypted in `traffic_source_settings.api_key_sealed`.

For production, ensure `AUTH_SECRET` is set as a Worker secret:

```bash
bunx wrangler secret put AUTH_SECRET --env production
```

This secret is used to encrypt/decrypt API keys. If you change it, all stored keys become invalid and must be re-entered.
