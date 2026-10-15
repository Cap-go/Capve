const LABELS: Record<string, string> = {
  ftd: "FTD",
  registration: "Registrations",
  deposit: "Deposits",
  lead: "Leads",
  sale: "Sales",
};

const ORDER = ["registration", "lead", "ftd", "deposit", "sale"];

/** Funnel order (registration before FTD), then alphabetical. */
export function sortEvents(events: string[]): string[] {
  const rank = (event: string) => {
    const index = ORDER.indexOf(event);
    return index === -1 ? ORDER.length : index;
  };
  return [...events].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

const SINGULAR: Record<string, string> = {
  ftd: "FTD",
  registration: "Registration",
  deposit: "Deposit",
  lead: "Lead",
  sale: "Sale",
};

/** Label for one conversion's event (singular), e.g. in the conversion log. */
export function eventName(event: string): string {
  return SINGULAR[event] ?? event.charAt(0).toUpperCase() + event.slice(1);
}

/** Column/stat label for a conversion event name. */
export function eventLabel(event: string): string {
  return LABELS[event] ?? event.charAt(0).toUpperCase() + event.slice(1);
}
