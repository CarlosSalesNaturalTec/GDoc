import { vi } from 'vitest';

interface MockedResponse {
  status: number;
  body?: unknown;
}

type RouteTable = Record<string, MockedResponse>;

/**
 * Substitui `global.fetch` por uma tabela `"METHOD /caminho" -> resposta`.
 * Nesta fatia só existem os endpoints de auth (`/auth/me`, `/auth/login`,
 * `/auth/logout`) e, para exercitar o tratamento central de 401 (design.md
 * D4), qualquer outro endpoint real usado apenas como demonstração.
 */
export function mockFetch(table: RouteTable): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const path = new URL(url, 'http://localhost').pathname;
      const method = (init?.method ?? 'GET').toUpperCase();
      const route = table[`${method} ${path}`];
      if (!route) {
        return new Response(JSON.stringify({ error: 'unmocked_route' }), { status: 404 });
      }
      return new Response(route.body !== undefined ? JSON.stringify(route.body) : undefined, {
        status: route.status,
      });
    }),
  );
}
