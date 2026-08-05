/**
 * Erro de API tipado pelo status HTTP — permite ao chamador distinguir
 * 401/403/etc. `details` carrega o corpo JSON completo da resposta de erro
 * (design.md D5 de `download-pasta-zip`): a recusa por limite do manifesto
 * de download de pasta devolve campos extras (`limit`, `found`, `allowed`)
 * que `message` sozinho não preserva.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

/**
 * Registrado pelo `SessionProvider` (design.md D4): um único ponto de
 * tratamento para 401 — cobre sessão expirada e conta desativada, já que o
 * servidor revalida status a cada requisição. Limpa a sessão do cliente e
 * navega a `/login`, qualquer que seja a chamada que disparou o 401.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /**
   * Cancela a requisição em voo (design.md `download-pasta-zip`, task 4.3):
   * sem isso, o StrictMode do React 18 — que remonta todo `useEffect` uma
   * vez em dev — dispara a chamada duas vezes antes que a primeira possa ser
   * interrompida, dobrando efeitos irreversíveis do lado do servidor (URLs
   * assinadas emitidas, eventos de auditoria gravados) para um único clique.
   */
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError(401, 'not authenticated');
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, payload.error ?? 'unknown_error', payload);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/** Cliente HTTP fino: sempre `credentials: 'include'` (cookie de sessão same-origin, design.md D1). */
export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> =>
    request<T>(path, { method: 'POST', body, signal }),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};
