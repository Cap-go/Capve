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

function collect(values: Array<string | null | undefined> | undefined): Set<string> {
  const ids = new Set<string>();
  for (const value of values ?? []) {
    const id = matchRules(value);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Picks the affiliate network for a campaign's postback macros.
 * Destination and offer URLs win. A campaign or network name is used only when
 * no URL matches. Conflicting URLs, or conflicting names with no URL, stay unset
 * so the tracking page leaves the choice manual.
 */
export function inferNetworkId(input: {
  destination?: string | null;
  urls?: Array<string | null | undefined>;
  names?: Array<string | null | undefined>;
}): string | null {
  const urls = new Set<string>();
  const destination = matchRules(input.destination);
  if (destination) urls.add(destination);
  for (const id of collect(input.urls)) urls.add(id);
  if (urls.size > 1) return null;
  if (urls.size === 1) return [...urls][0] ?? null;
  const names = collect(input.names);
  if (names.size !== 1) return null;
  return [...names][0] ?? null;
}
