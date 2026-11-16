export interface HttpResult { status: number; text: string }
interface RequestInit {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function assistantRequest(url: string, init: RequestInit): Promise<HttpResult> {
  const timeout = AbortSignal.timeout(init.timeoutMs ?? 15_000);
  const response = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    credentials: 'same-origin',
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
  if (response.status === 409 || (response.status === 401 && (await response.clone().json().catch(() => null) as { error?: string } | null)?.error === 'Use a signed-in Capve session'))
    throw new Error('assistant_session_required');
  return { status: response.status, text: await response.text() };
}

export function assistantOpenAIRequest(path: 'models' | 'responses', accessToken: string, init: RequestInit) {
  return assistantRequest(`/api/assistant/${path}`, {
    ...init, headers: { ...init.headers, 'x-chatgpt-token': accessToken },
  });
}
