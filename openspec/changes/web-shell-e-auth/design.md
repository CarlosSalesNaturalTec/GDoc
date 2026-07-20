## Context

O backend está completo e autentica por **cookie de sessão `HttpOnly`,
`SameSite=Strict`, `Secure` fora de dev**, relido do banco a cada requisição
(`apps/api/src/middleware/tenant-context.ts`, `lib/session-cookie.ts`). A API
**não tem CORS** e os handlers ficam em prefixos de topo (`/auth`, `/files`,
`/folders`, `/users`, `/grants`, `/trash`, `/audit`, `/dashboard`, `/search`,
`/health`) — não há prefixo `/api`. O frontend ainda não existe: `apps/web` é
só o workspace reservado; a infra prevê a SPA como **bucket estático + CDN atrás
de um load balancer** (`infra/terraform/frontend.tf`), cujo url-map hoje só
aponta para o bucket.

Esta fatia cria a fundação da SPA com **Ant Design** (decisão do produto: usar
design system, não Tailwind cru) e o fluxo de autenticação, base para todas as
fatias catalogadas em `docs/frontend_roadmap.md`.

## Goals / Non-Goals

**Goals:**
- SPA executável (Vite/React/TS + Ant Design) com login, sessão e shell.
- Preservar o modelo de sessão do backend **sem tocar na API nem introduzir
  CORS**, servindo SPA e API na **mesma origem**.
- Fundação reutilizável (apiClient, TanStack Query, roteador+guarda, tema AntD)
  sobre a qual as próximas fatias apenas adicionam telas.

**Non-Goals:**
- Telas de qualquer feature além de auth/shell (ver roadmap).
- Qualquer alteração em `apps/api` ou `packages/shared`.
- Aplicar Terraform (o repo nunca aplica infra).

## Decisions

### D1 — Mesma origem para preservar o cookie `SameSite=Strict` sem CORS
O cookie `Strict` não acompanha requisições cross-site e a API não emite CORS.
Em vez de afrouxar o backend (habilitar CORS + `SameSite=None`, o que
enfraqueceria a postura de segurança), **servimos a SPA na mesma origem da API**:
- **Dev**: proxy do Vite (`server.proxy`) encaminha os prefixos de API para
  `http://localhost:8080`. O browser enxerga uma única origem (`localhost:5173`),
  o cookie flui e não há preflight/CORS.
- **Prod**: `path_matcher` no url-map do load balancer roteia os mesmos prefixos
  para um **serverless NEG** da Cloud Run; `/*` continua no bucket+CDN. Uma
  origem só sob o LB.
_Alternativas rejeitadas_: (a) CORS + `SameSite=None` — expõe o cookie a
contextos cross-site e contraria `session-cookie.ts`; (b) prefixar tudo com
`/api` na API — mexeria no backend estável sem necessidade.

### D2 — Roteamento por prefixos existentes (sem `/api`)
O proxy (dev) e o `path_matcher` (prod) listam os prefixos de topo já servidos
pela API. Evita reescrever caminho e mantém as URLs que os DTOs/handlers já
usam. A lista vive em um único lugar no `vite.config.ts` e é espelhada na regra
de infra.

### D3 — Sessão é do servidor; o cliente só reflete `GET /auth/me`
Como o token é `HttpOnly`, o JS **não** o lê. O estado de autenticação do
cliente é derivado de `GET /auth/me` no bootstrap (e do retorno do login). Um
**contexto de sessão** guarda a `AuthenticatedIdentity`; não se persiste token
em `localStorage` (não há acesso a ele, e seria um antipadrão de segurança).
Logout chama `POST /auth/logout` e limpa o estado do cliente.

### D4 — 401 centralizado encerra a sessão no cliente
O `apiClient` trata `401` de forma única: limpa o contexto de sessão e
redireciona a `/login`. Isso cobre expiração e **conta desativada** (o backend
revalida status a cada request e responde 401), atendendo US 1.2 cenário 3 sem
lógica espalhada.

### D5 — Ant Design v5 com `ConfigProvider` + `<App>` e TanStack Query
Tema/tokens via `ConfigProvider` (cor primária, raio, tipografia; `locale`
pt-BR). Envolver a árvore no wrapper `<App>` do AntD para `message`/`notification`
com contexto correto. O AntD cobre **UI**; o **estado de servidor** (fetch,
cache, invalidação, mutations) fica no **TanStack Query** — divisão explícita
para as próximas fatias seguirem o mesmo padrão. **Zod** valida respostas na
fronteira, espelhando `@gdoc/shared`.
_Alternativa rejeitada_: usar só `Form`/estado local do AntD para dados de
servidor — perde cache/invalidação que as fatias de listagem vão precisar.

### D6 — Guarda de rota por autenticação e por papel
React Router com uma rota-guarda: sem identidade resolvida ⇒ redireciona a
`/login`; rotas de administração (pessoas, painel, auditoria ampla) exigem
`unit_admin`/`global_admin`. O shell renderiza o `Menu` conforme o papel. Assim
as próximas fatias só declaram a rota e o papel exigido.

## Risks / Trade-offs

- **Prod depende do `path_matcher` no LB** → se a SPA for publicada sem essa
  regra, o cookie `Strict` quebra em produção. Mitigação: a regra entra nesta
  change (escrita) e o `design.md` a documenta como pré-requisito de deploy; o
  dev já funciona pelo proxy, então o contrato de mesma origem é exercitado
  desde o início.
- **Proxy de dev cobre uma lista de prefixos** → um endpoint novo com prefixo
  novo exigiria atualizar a lista. Mitigação: os prefixos são estáveis (um por
  router) e centralizados; documentado no `vite.config.ts`.
- **AntD é CSS-in-JS e opinativo** → customização de tema fica nos tokens do
  `ConfigProvider`; evitar sobrescrever CSS à mão para não brigar com o design
  system. Mitigação: padronizar tokens/tema num único módulo desde a fatia 1.

## Migration Plan

- Puramente aditivo: novo workspace `apps/web` + doc + regra de infra (não
  aplicada). Nada a migrar no banco ou na API.
- **Rollback**: remover o workspace `apps/web` e a regra de url-map; nenhum
  estado do backend é afetado.

## Open Questions

- **Publicação do build no CI/CD** (passo `vite build` → bucket): pode entrar
  mínimo nesta fatia ou como ajuste próprio de CI — não bloqueia o shell/auth.
  Fica registrado no roadmap e decidido quando a primeira fatia navegável for
  para deploy.
