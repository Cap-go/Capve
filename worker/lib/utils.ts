export function id(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "program";
}

export function apiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `pk_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function affiliateCode(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export function convertSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `sk_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
