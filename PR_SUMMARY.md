# PR #81: Campaign List Improvements Summary

## Changes Overview

This PR adds three major features to the Campaigns list page:

1. **Period Selector** - Filter stats by time period
2. **FTD & Registrations Columns** - See event-specific metrics
3. **Column Visibility Controls** - Customize which columns to show

## 1. Period Selector

The campaigns table now has a period dropdown with these options:
- Today
- Yesterday  
- Last 7 days
- Last 14 days
- Last 30 days
- This month
- Last month
- Custom range (opens date picker)
- All time

**Location:** Top toolbar, left side next to the status filter

**Behavior:**
- Period selection persists in `localStorage` across sessions
- All stats columns (Clicks, Conversions, FTD, Registrations, Revenue, Cost, Profit, ROI) respect the period
- Uses the same timezone handling as the Performance tab
- Backend already supports `from`/`to` query params - no API changes needed

## 2. FTD and Registrations Columns

Two new columns show event-specific conversion counts:

- **Registrations**: Shows `events.registration` count from the report data
- **FTD**: Shows `events.ftd` count from the report data

These are separate from the generic "Conversions" column, allowing you to see:
- How many registrations happened
- How many first-time deposits happened
- Total conversions (which includes all events)

**Attribution:** Conversions are attributed to the day the postback arrived, consistent with the Performance tab.

## 3. Column Visibility Controls

A new "Columns" button in the toolbar opens a menu where you can show/hide any column.

**Available columns:**
- Status
- Campaign
- ID (hidden by default)
- Source
- Created
- Clicks
- Registrations (new)
- FTD (new)
- Conversions
- Revenue
- Cost
- Profit
- ROI

**Features:**
- Click checkbox to toggle column visibility
- Preferences persist in `localStorage` (key: `capve_campaigns_columns`)
- Sensible defaults: all visible except ID

## Technical Implementation

### New Components
- `src/components/PeriodSelector.tsx` - Reusable period selector with date picker

### Updated Components
- `src/components/CampaignList.tsx` - Added period state, column visibility state, and UI
- `src/pages/Dashboard.tsx` - Passes period changes to API

### Styling
- `src/index.css` - Added `.columns-menu` classes for the dropdown

### Storage Keys
- `capve_campaigns_period` - Stores selected period preset
- `capve_campaigns_columns` - Stores visible column keys as JSON array

### API Integration
- Backend `/api/reports/campaigns` already accepts `from` and `to` params
- Frontend now passes these based on the selected period
- No backend changes required

## Testing

✅ TypeScript compilation passes  
✅ Build succeeds  
✅ Existing dashboard tests pass  
❌ Some tests require `cloudflare:test` (not related to this PR)

## Caveats

1. **Cost data**: Cost comes from `traffic_source_daily_stats` where available (Adcash imports), otherwise from click-based cost. This is consistent with existing behavior.

2. **Timezone**: The period uses the account's timezone setting. If no timezone is configured, dates are interpreted in UTC (this is existing behavior from the Performance tab).

3. **FTD/Registrations without events**: If a campaign has no `registration` or `ftd` events in its conversions, these columns will show 0.

4. **Column persistence**: Column visibility is stored per browser (localStorage), not per user account. If a user switches browsers or clears storage, they'll see the default columns.

## Screenshots

(To be added - showing the period selector, new columns, and columns menu in action)

## Next Steps

After this PR is merged, consider:
- Adding a "Reset columns" button to restore defaults
- Adding tooltips to explain what each column means
- Exporting CSV with the selected period and visible columns
