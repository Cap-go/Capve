export async function fireTriggerWebhooks(
  triggers: Array<{ action_url: string; name: string }>,
  payload: Record<string, string | number | null>,
): Promise<void> {
  await Promise.all(
    triggers.map(async (trigger) => {
      try {
        const url = substituteMacros(trigger.action_url, payload);
        await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
      } catch {
        // Triggers are best-effort; do not block conversion flow.
      }
    }),
  );
}

function substituteMacros(
  template: string,
  payload: Record<string, string | number | null>,
): string {
  return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
    const value = payload[key];
    return value == null ? "" : encodeURIComponent(String(value));
  });
}
