## 1. Prefixos de API e configuração

- [ ] 1.1 Criar `apps/api/src/lib/api-prefixes.ts` com a lista de prefixos de
  API (`/auth`, `/files`, `/folders`, `/users`, `/grants`, `/trash`,
  `/audit`, `/dashboard`, `/search`, `/health`, **`/internal`**) e o
  comentário de sincronia apontando as três pontas
  (`apps/web/vite.config.ts::API_PROXY_PREFIXES`,
  `infra/terraform/locals.tf::api_proxy_prefixes`) — design.md D2.
- [ ] 1.2 Atualizar os comentários de sincronia em `apps/web/vite.config.ts`
  e `infra/terraform/locals.tf` para citarem também
  `apps/api/src/lib/api-prefixes.ts` (três pontas, não duas).
- [ ] 1.3 `apps/api/src/config.ts`: adicionar `webDistDir` opcional a partir
  de `WEB_DIST_DIR`, resolvido com `resolveRepoPath` (mesmo tratamento de
  `STORAGE_SIGNER_KEY_PATH`) — design.md D3.

## 2. Serving estático na API

- [ ] 2.1 `apps/api/src/app.ts`: aceitar opção `webDistDir` em
  `createApp(ports, options?)` (default: `config.webDistDir`); quando
  definida, validar no arranque que o diretório existe e contém
  `index.html`, falhando com erro explícito caso contrário (fail-fast,
  design.md D3; spec "Serving condicionado à configuração").
- [ ] 2.2 Montar, **após todos os routers e antes do error handler**:
  `express.static(webDistDir, { index: false })` com `Cache-Control`
  `public, max-age=31536000, immutable` para `/assets/*` e default para os
  demais arquivos — design.md D2/D4.
- [ ] 2.3 Implementar o fallback de `index.html`: só `GET`/`HEAD`, só para
  caminhos que **não** começam por prefixo de `api-prefixes.ts`; resposta
  com `Cache-Control: no-store` (também no `GET /` servido via fallback) —
  spec "Rotas de API nunca sombreadas" e "Política de cache".

## 3. Testes (supertest, `dist/` de fixture)

- [ ] 3.1 Fixture: diretório temporário com `index.html` e
  `assets/app.abc123.js` criado no setup do teste; `createApp(ports,
  { webDistDir })` injetado.
- [ ] 3.2 Cenários felizes: `GET /` → 200 `index.html` + `no-store`;
  `GET /assets/app.abc123.js` → 200 + `immutable`; `GET /busca` (deep-link)
  → 200 `index.html`.
- [ ] 3.3 Cenários de guarda: `GET /files/rota-inexistente` → resposta da API
  (nunca HTML); `GET /auth/me` sem sessão → contrato atual da API;
  `POST /caminho-desconhecido` → 404 sem HTML da SPA.
- [ ] 3.4 Cenários de configuração: sem `webDistDir` → `GET /` responde como
  hoje (404); `webDistDir` inválido → `createApp` lança erro no arranque.

## 4. Dockerfile

- [ ] 4.1 Estágio `deps`: `COPY apps/web/package.json
  apps/web/package.json` antes do `npm ci`.
- [ ] 4.2 Estágio `build`: `COPY apps/web apps/web` e `npm run build
  --workspace apps/web` após o build do `shared` (antes do
  `npm prune --omit=dev`).
- [ ] 4.3 Estágio `runtime`: `COPY --from=build /app/apps/web/dist
  ./apps/web/dist` e `ENV WEB_DIST_DIR=/app/apps/web/dist`.
- [ ] 4.4 Validar localmente: `docker build -f apps/api/Dockerfile .` (ou, se
  o daemon não estiver disponível no sandbox, revisar os estágios contra o
  build local `npm run build` de todos os workspaces).

## 5. Docs e comentários

- [ ] 5.1 `infra/terraform/frontend.tf`: atualizar o comentário desatualizado
  ("apps/web ainda é só o layout reservado") — a SPA existe e é servida pelo
  Cloud Run na fase sem domínio; o bucket fica reservado para a fase com
  domínio (LB + CDN).
- [ ] 5.2 `docs/frontend_roadmap.md`: corrigir o rótulo da Fatia 1
  ("✅ proposta criada" → "✅ entregue") e adicionar seção curta "Produção
  sem domínio" registrando a decisão interina (Cloud Run serve SPA+API na
  URL `*.run.app`; fase com domínio = `frontend_domain` + bucket/CDN + LB,
  change futura).

## 6. Verificação

- [ ] 6.1 `npm run lint && npm run build && npm run test` verdes na raiz.
- [ ] 6.2 Smoke local: `WEB_DIST_DIR=apps/web/dist` (após `npm run build`)
  com a API de dev no ar — `GET /` devolve a SPA, login funciona na mesma
  origem, `GET /files/rota-inexistente` devolve 404 da API.
