## 1. Prefixos de API e configuração

- [x] 1.1 Criar `apps/api/src/lib/api-prefixes.ts` com a lista de prefixos de
  API (`/auth`, `/files`, `/folders`, `/users`, `/grants`, `/trash`,
  `/audit`, `/dashboard`, `/search`, `/health`, **`/internal`**) e o
  comentário de sincronia apontando as três pontas
  (`apps/web/vite.config.ts::API_PROXY_PREFIXES`,
  `infra/terraform/locals.tf::api_proxy_prefixes`) — design.md D2.
- [x] 1.2 Atualizar os comentários de sincronia em `apps/web/vite.config.ts`
  e `infra/terraform/locals.tf` para citarem também
  `apps/api/src/lib/api-prefixes.ts` (três pontas, não duas).
- [x] 1.3 `apps/api/src/config.ts`: adicionar `webDistDir` opcional a partir
  de `WEB_DIST_DIR`, resolvido com `resolveRepoPath` (mesmo tratamento de
  `STORAGE_SIGNER_KEY_PATH`) — design.md D3.

## 2. Serving estático na API

- [x] 2.1 `apps/api/src/app.ts`: aceitar opção `webDistDir` em
  `createApp(ports, options?)` (default: `config.webDistDir`); quando
  definida, validar no arranque que o diretório existe e contém
  `index.html`, falhando com erro explícito caso contrário (fail-fast,
  design.md D3; spec "Serving condicionado à configuração").
- [x] 2.2 Montar, **após todos os routers e antes do error handler**:
  `express.static(webDistDir, { index: false })` com `Cache-Control`
  `public, max-age=31536000, immutable` para `/assets/*` e default para os
  demais arquivos — design.md D2/D4.
- [x] 2.3 Implementar o fallback de `index.html`: só `GET`/`HEAD`, só para
  caminhos que **não** começam por prefixo de `api-prefixes.ts`; resposta
  com `Cache-Control: no-store` (também no `GET /` servido via fallback) —
  spec "Rotas de API nunca sombreadas" e "Política de cache".

## 3. Testes (supertest, `dist/` de fixture)

- [x] 3.1 Fixture: diretório temporário com `index.html` e
  `assets/app.abc123.js` criado no setup do teste; `createApp(ports,
  { webDistDir })` injetado.
- [x] 3.2 Cenários felizes: `GET /` → 200 `index.html` + `no-store`;
  `GET /assets/app.abc123.js` → 200 + `immutable`; `GET /busca` (deep-link)
  → 200 `index.html`.
- [x] 3.3 Cenários de guarda: `GET /files/rota-inexistente` → resposta da API
  (nunca HTML); `GET /auth/me` sem sessão → contrato atual da API;
  `POST /caminho-desconhecido` → 404 sem HTML da SPA.
- [x] 3.4 Cenários de configuração: sem `webDistDir` → `GET /` responde como
  hoje (404); `webDistDir` inválido → `createApp` lança erro no arranque.

  **Achado durante a implementação:** `attachTenantContext(ports)` era
  montado via `app.use(attachTenantContext(ports), xRouter(ports))` — sem
  path próprio, o Express aplica esse middleware a **qualquer** caminho, não
  só aos do router em questão. Isso já fazia (antes deste change) qualquer
  caminho sem sessão e sem rota correspondente responder `401` em vez do
  `404` padrão do Express, e teria bloqueado deep-links não autenticados
  (`GET /busca` sem sessão) com `401` em vez do fallback de `index.html`.
  Corrigido em `app.ts`: um único `app.use(['/files', '/folders', '/users',
  '/grants', '/trash', '/dashboard'], attachTenantContext(ports))` escopado
  aos prefixos reais, montado antes dos routers (que passam a ser montados
  sem o middleware acoplado). `auditRouter`/`searchRouter` vivem sob
  `/files`, por isso não têm prefixo próprio. Nenhuma rota real muda de
  comportamento (mesmas 140 asserções pré-existentes continuam verdes); o
  fallback de SPA também foi remontado **antes** desses routers (não depois,
  como a princípio em design.md D2) pelo mesmo motivo — ver comentário em
  `app.ts`.

## 4. Dockerfile

- [x] 4.1 Estágio `deps`: `COPY apps/web/package.json
  apps/web/package.json` antes do `npm ci`.
- [x] 4.2 Estágio `build`: `COPY apps/web apps/web` e `npm run build
  --workspace apps/web` após o build do `shared` (antes do
  `npm prune --omit=dev`).
- [x] 4.3 Estágio `runtime`: `COPY --from=build /app/apps/web/dist
  ./apps/web/dist` e `ENV WEB_DIST_DIR=/app/apps/web/dist`.
- [x] 4.4 Validar localmente: `docker build -f apps/api/Dockerfile .` (ou, se
  o daemon não estiver disponível no sandbox, revisar os estágios contra o
  build local `npm run build` de todos os workspaces). Daemon indisponível
  neste sandbox — validado com `npm run build` na raiz (shared → api → web,
  os mesmos comandos dos estágios do Dockerfile), verde.

## 5. Docs e comentários

- [x] 5.1 `infra/terraform/frontend.tf`: atualizar o comentário desatualizado
  ("apps/web ainda é só o layout reservado") — a SPA existe e é servida pelo
  Cloud Run na fase sem domínio; o bucket fica reservado para a fase com
  domínio (LB + CDN).
- [x] 5.2 `docs/frontend_roadmap.md`: corrigir o rótulo da Fatia 1
  ("✅ proposta criada" → "✅ entregue") e adicionar seção curta "Produção
  sem domínio" registrando a decisão interina (Cloud Run serve SPA+API na
  URL `*.run.app`; fase com domínio = `frontend_domain` + bucket/CDN + LB,
  change futura).

## 6. Verificação

- [x] 6.1 `npm run lint && npm run build && npm run test` verdes na raiz.
  (lint: 3/3 workspaces limpos; build: shared → api → web ok; testes: API
  140/140, web 68/68).
- [x] 6.2 Smoke local: `WEB_DIST_DIR=apps/web/dist` (após `npm run build`)
  com a API de dev no ar — `GET /` devolve a SPA (200 + `no-store`),
  `GET /assets/*.js` devolve `immutable`, `GET /busca` (deep-link) devolve a
  SPA, login funciona na mesma origem (`POST /auth/login` → cookie →
  `GET /auth/me` 200), `GET /files/rota-inexistente` sem sessão devolve 401
  da API e, autenticado, o 404 padrão do Express — nunca `index.html`.
