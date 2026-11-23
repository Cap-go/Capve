/** Network id inferred from a destination, offer URL, network name, or campaign name. */
const URL_RULES: Array<[RegExp, string]> = [
  [/goyesplay\.com|yesplay/i, "yesplay"],
  [/tonybet/i, "tonybet"],
  [/affilka|softswiss/i, "affilka"],
  [/cellxpert/i, "cellxpert"],
  [/myaffiliates/i, "myaffiliates"],
];

function matchRules(value: string | null | undefined): string | null {
  if (!value) return null;
  for (const [pattern, id] of URL_RULES) {
    if (pattern.test(value)) return id;
  }
  return null;
}

/**
 * Picks the affiliate network for a campaign's postback macros.
 * Destination and offer URLs win over names, so a YesPlay offer is not hidden by the campaign title.
 */
export function inferNetworkId(input: {
  destination?: string | null;
  urls?: Array<string | null | undefined>;
  names?: Array<string | null | undefined>;
}): string | null {
  const fromDestination = matchRules(input.destination);
  if (fromDestination) return fromDestination;
  for (const url of input.urls ?? []) {
    const match = matchRules(url);
    if (match) return match;
  }
  for (const name of input.names ?? []) {
    const match = matchRules(name);
    if (match) return match;
  }
  return null;
}
