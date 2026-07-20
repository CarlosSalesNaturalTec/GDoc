/** Erro de API tipado pelo status HTTP — permite ao chamador distinguir 401/403/etc. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
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
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError(401, 'not authenticated');
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, payload.error ?? 'unknown_error');
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/** Cliente HTTP fino: sempre `credentials: 'include'` (cookie de sessão same-origin, design.md D1). */
export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'POST', body }),
};
