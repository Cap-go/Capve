/**
 * AES-GCM encryption for third-party API keys stored in D1, keyed from AUTH_SECRET.
 * Rotating AUTH_SECRET makes stored keys unreadable: re-enter them after a rotation.
 */
async function key(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`capve-api-key:${secret}`),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
}

export async function sealSecret(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(secret),
    new TextEncoder().encode(plain),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

/** Returns null when the value cannot be decrypted (wrong secret or corrupt). */
export async function openSecret(sealed: string, secret: string): Promise<string | null> {
  const [version, iv, data] = sealed.split(".");
  if (version !== "v1" || !iv || !data) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      await key(secret),
      fromBase64(data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
