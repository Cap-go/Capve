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
 * Returns null when nothing matches, or when the destination, offers and names
 * point at more than one network. The tracking page then leaves the choice manual.
 */
export function inferNetworkId(input: {
  destination?: string | null;
  urls?: Array<string | null | undefined>;
  names?: Array<string | null | undefined>;
}): string | null {
  const ids = new Set<string>();
  const destination = matchRules(input.destination);
  if (destination) ids.add(destination);
  for (const id of collect(input.urls)) ids.add(id);
  for (const id of collect(input.names)) ids.add(id);
  if (ids.size !== 1) return null;
  return [...ids][0] ?? null;
}
