## Why

As **10 fatias do roadmap de frontend** (`docs/frontend_roadmap.md`) estão
entregues: a SPA tem paridade funcional com o backend (Épicos 1–9). Mas **a SPA
não está em produção**: o pipeline de deploy (`.github/workflows/deploy.yml`)
só builda e publica a imagem da **API** no Cloud Run — nenhum passo builda
`apps/web` nem publica o `dist/`, e o bucket do frontend provisionado pelo
Terraform está **vazio** (o comentário em `infra/terraform/frontend.tf` ainda
diz que "`apps/web` é só o layout reservado", o que deixou de ser verdade).

O plano original de produção — bucket+CDN atrás de um load balancer com
`path_matcher` roteando os prefixos de API para a Cloud Run (mesma origem) —
**exige um domínio**: `create_frontend_lb = var.frontend_domain != ""`
(`locals.tf`), porque o certificado gerenciado do Google só é emitido para um
domínio real. **Ainda não temos nenhum domínio registrado.** E sem o LB não há
mesma origem: a URL pública do bucket (`storage.googleapis.com`) é outra origem
em relação à API, o que mata o pilar da autenticação — cookie de sessão
`HttpOnly`/`Secure`/`SameSite=Strict`, sem CORS (design.md D1/D2 do change
`web-shell-e-auth`, `apps/api/src/lib/session-cookie.ts`).

Neste primeiro momento, a única URL bruta fornecida pela GCP que oferece TLS
**e** pode ser a mesma origem de SPA+API é a **URL do próprio serviço Cloud
Run** (`*.run.app`). Este change coloca a SPA em produção servindo o `dist/`
pelo mesmo Cloud Run da API — sem domínio, sem CORS, sem tocar na arquitetura
de sessão — e deixa o caminho bucket+CDN+LB intacto para quando o domínio
existir.

## What Changes

- **API passa a servir a SPA em produção (mesma origem)**: quando o diretório
  do build da web está configurado (`WEB_DIST_DIR`), o Express serve os
  assets estáticos do `dist/` e responde `index.html` como *fallback* para
  requisições `GET` fora dos prefixos de API (deep-link de rota client-side,
  ex.: `/busca`, `/admin/painel`, funciona ao recarregar a página). Requisição
  sob prefixo de API que não casa com rota **continua** com a resposta da API
  (nunca `index.html`) — a lista de prefixos espelha
  `apps/web/vite.config.ts` (`API_PROXY_PREFIXES`) e
  `infra/terraform/locals.tf` (`api_proxy_prefixes`), com o mesmo aviso de
  sincronia.
- **Cache correto por classe de artefato**: assets com hash no nome
  (`/assets/*`) saem com `Cache-Control` imutável de longa duração;
  `index.html` sai sem cache, para que cada deploy propague na hora.
- **Dockerfile da API passa a embutir o build da web**: o estágio de build
  compila `apps/web` (Vite) além de `packages/shared` e `apps/api`, e o
  estágio de runtime carrega o `dist/` da web com `WEB_DIST_DIR` apontando
  para ele. **`deploy.yml` não muda**: o mesmo `docker build` + `gcloud run
  deploy` de hoje passa a entregar SPA+API juntas.
- **Dev não muda**: sem `WEB_DIST_DIR` a API se comporta exatamente como hoje
  (nenhum estático servido); a SPA de dev continua no Vite
  (`npm run dev:web`) com proxy de mesma origem.
- **Docs e comentários desatualizados**: atualizar o comentário de
  `infra/terraform/frontend.tf` (a SPA existe; o bucket fica reservado para a
  fase com domínio), registrar a decisão de serving interino no
  `docs/frontend_roadmap.md` e corrigir o rótulo da Fatia 1 ("✅ proposta
  criada" → entregue).

### Fora de escopo (mudanças futuras)

- **Fase com domínio**: registrar domínio, definir `frontend_domain`, aplicar
  o Terraform (LB + certificado gerenciado + IP global), publicar o `dist/`
  no bucket+CDN e invalidar o CDN a cada deploy. O serving estático pela API
  permanece inofensivo atrás do LB (o `path_matcher` só manda prefixos de API
  para a Cloud Run).
- **CORS**: nunca — a mesma origem é decisão de arquitetura, não limitação.
- **Upload resumável, CDN para assets da SPA via Cloud Run**: não entram.

## Capabilities

### New Capabilities

- `publicacao-frontend`: como a SPA é publicada e servida em produção —
  mesma origem que a API (fase sem domínio: pelo próprio Cloud Run),
  fallback de rotas client-side, política de cache por classe de artefato e
  garantia de que rotas de API nunca são sombreadas pelo estático.

### Modified Capabilities

_Nenhuma_ — os requisitos de `platform-infrastructure` (storage privado, URLs
assinadas, RLS, cota) não mudam; a autenticação (`autenticacao`) continua com o
mesmo contrato de cookie e mesma origem.

## Impact

- **`apps/api`**: `app.ts` (montagem do estático + fallback após os routers),
  `config.ts` (novo `WEB_DIST_DIR` opcional), novo módulo com a lista de
  prefixos de API, testes de integração do serving (supertest com `dist/` de
  fixture). Nenhuma rota de negócio muda.
- **`apps/api/Dockerfile`**: estágios de deps/build/runtime passam a incluir
  `apps/web`.
- **`.github/workflows/`**: nenhuma mudança (CI já builda/testa a web;
  deploy já entrega a imagem que agora contém a SPA).
- **`infra/terraform/`**: nenhum recurso novo; só comentário de
  `frontend.tf` atualizado.
- **`apps/web`, `packages/shared`, banco**: intocados.
