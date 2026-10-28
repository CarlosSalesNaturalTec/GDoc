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

export type RouteTable = Record<string, RouteEntry>;

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

/**
 * Rotas que a **tela inicial** consulta ao montar (change `shell-e-inicio`):
 * as pastas de primeiro nível e as alterações recentes, emitidas em paralelo.
 * Todo teste que pousa em `/` precisa das duas, ou as áreas correspondentes
 * renderizam o estado de erro — ruído que esconderia o que o teste afirma.
 *
 * Exportado como constante, e não embutido no `mockFetch`, porque a tabela de
 * rotas é explícita por desenho: um teste que queira exercitar a falha de uma
 * dessas rotas sobrescreve a entrada, em vez de lutar contra um padrão
 * implícito.
 */
export const ROTAS_DA_TELA_INICIAL: RouteTable = {
  'GET /folders/root/contents': {
    status: 200,
    body: { folder: null, breadcrumb: [], folders: [], files: [], canUpload: true },
  },
  'GET /files/recent': { status: 200, body: { documents: [] } },
};
