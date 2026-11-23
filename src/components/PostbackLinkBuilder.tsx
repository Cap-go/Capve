import { useEffect, useState } from "react";
import { NETWORK_TEMPLATES, type NetworkTemplate } from "../../worker/lib/source-templates";
import { buildPostbackUrl } from "../../worker/lib/urls";
import { CodeBlock } from "./CodeBlock";
import { SelectField } from "./ui";

const CUSTOM: NetworkTemplate = {
  id: "custom",
  name: "Custom",
  offer_param: "click_id",
  click_macro: "{click_id}",
  payout_macro: "{payout}",
  status_macro: "{status}",
  verified: true,
};

const PICKER_ORDER = ["yesplay", "affilka", "tonybet"];

const NETWORKS: NetworkTemplate[] = [
  ...PICKER_ORDER.map((id) => NETWORK_TEMPLATES.find((template) => template.id === id)!),
  ...NETWORK_TEMPLATES.filter((template) => !PICKER_ORDER.includes(template.id)),
  CUSTOM,
];

type Saved = { network?: string; includePayout?: boolean; includeStatus?: boolean };

type Props = {
  baseUrl: string;
  postbackKey?: string;
  inferredNetwork?: string | null;
  campaignId: string;
};

function readSaved(storageKey: string): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export function PostbackLinkBuilder({ baseUrl, postbackKey, inferredNetwork, campaignId }: Props) {
  const storageKey = `capve:postback-config:${campaignId}`;
  const fallback = inferredNetwork && NETWORKS.some((network) => network.id === inferredNetwork)
    ? inferredNetwork
    : "custom";
  const saved = readSaved(storageKey);

  const [selectedNetwork, setSelectedNetwork] = useState(
    saved?.network && NETWORKS.some((network) => network.id === saved.network) ? saved.network : fallback,
  );
  const [includePayout, setIncludePayout] = useState(saved?.includePayout ?? false);
  const [includeStatus, setIncludeStatus] = useState(saved?.includeStatus ?? false);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ network: selectedNetwork, includePayout, includeStatus }),
      );
    } catch {
      // Preference is session-only when storage is blocked.
    }
  }, [selectedNetwork, includePayout, includeStatus, storageKey]);

  const network = NETWORKS.find((item) => item.id === selectedNetwork) ?? CUSTOM;
  const link = (event?: string) =>
    buildPostbackUrl(baseUrl, {
      clickMacro: network.click_macro,
      includePayout,
      includeStatus: includeStatus && Boolean(network.status_macro),
      payoutMacro: network.payout_macro,
      statusMacro: network.status_macro,
      postbackKey,
      event,
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-52">
          <SelectField
            label="Network"
            value={selectedNetwork}
            onChange={setSelectedNetwork}
            options={NETWORKS.map((template) => ({ value: template.id, label: template.name }))}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={includePayout}
            onChange={(event) => setIncludePayout(event.target.checked)}
          />
          <span className="mono">payout</span>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={includeStatus}
            disabled={!network.status_macro}
            onChange={(event) => setIncludeStatus(event.target.checked)}
          />
          <span className="mono">cnv_status</span>
        </label>
      </div>

      <CodeBlock>{link()}</CodeBlock>
      <p className="text-sm text-[var(--velo-muted)]">
        Several events per campaign? Add one postback per event in the network. Each event is
        counted on its own in stats:
      </p>
      <CodeBlock label="Registration postback">{link("registration")}</CodeBlock>
      <CodeBlock label="FTD postback">{link("ftd")}</CodeBlock>
    </div>
  );
}
