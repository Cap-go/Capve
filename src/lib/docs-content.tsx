import { DocsAccounts } from "../pages/docs/DocsAccounts";
import { DocsOverview } from "../pages/docs/DocsOverview";
import { DocsClickIds } from "../pages/docs/DocsClickIds";
import { DocsCampaigns } from "../pages/docs/DocsCampaigns";
import { DocsMcp } from "../pages/docs/DocsMcp";
import { DocsPostback } from "../pages/docs/DocsPostback";
import { DocsTrafficSources } from "../pages/docs/DocsTrafficSources";
import { DocsTrackingLinks } from "../pages/docs/DocsTrackingLinks";
import { DocsRouting } from "../pages/docs/DocsRouting";
import { DocsBrowserAttribution } from "../pages/docs/DocsBrowserAttribution";
import { DocsServerConversions } from "../pages/docs/DocsServerConversions";
import { DocsConvertApi } from "../pages/docs/DocsConvertApi";
import { DocsGlossary } from "../pages/docs/DocsGlossary";

export const DOC_CONTENT = {
  "": DocsOverview,
  "click-ids": DocsClickIds,
  campaigns: DocsCampaigns,
  accounts: DocsAccounts,
  mcp: DocsMcp,
  postback: DocsPostback,
  "traffic-sources": DocsTrafficSources,
  "tracking-links": DocsTrackingLinks,
  routing: DocsRouting,
  "browser-attribution": DocsBrowserAttribution,
  "server-conversions": DocsServerConversions,
  "api/convert": DocsConvertApi,
  glossary: DocsGlossary,
};
