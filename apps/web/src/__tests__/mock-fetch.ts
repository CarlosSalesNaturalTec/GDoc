import { vi } from 'vitest';

interface MockedResponse {
  status: number;
  body?: unknown;
}

/**
 * Uma resposta fixa, ou uma fila consumida em ordem a cada chamada (última
 * entrada repete indefinidamente) — necessário quando uma mutation invalida e
 * a mesma rota de listagem é rechamada com um resultado diferente
 * (`web-navegacao`, tasks 6.1).
 */
type RouteEntry = MockedResponse | MockedResponse[];

type RouteTable = Record<string, RouteEntry>;

/**
 * Substitui `global.fetch` por uma tabela `"METHOD /caminho" -> resposta`.
 * Nesta fatia só existem os endpoints de auth (`/auth/me`, `/auth/login`,
 * `/auth/logout`) e, para exercitar o tratamento central de 401 (design.md
 * D4), qualquer outro endpoint real usado apenas como demonstração.
 */
export function mockFetch(table: RouteTable): void {
  const callIndex: Record<string, number> = {};

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const path = new URL(url, 'http://localhost').pathname;
      const method = (init?.method ?? 'GET').toUpperCase();
      const key = `${method} ${path}`;
      const entry = table[key];
      if (!entry) {
        return new Response(JSON.stringify({ error: 'unmocked_route' }), { status: 404 });
      }

      let route: MockedResponse;
      if (Array.isArray(entry)) {
        const index = callIndex[key] ?? 0;
        route = entry[Math.min(index, entry.length - 1)]!;
        callIndex[key] = index + 1;
      } else {
        route = entry;
      }

      return new Response(route.body !== undefined ? JSON.stringify(route.body) : undefined, {
        status: route.status,
      });
    }),
  );
}
