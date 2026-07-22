## Context

As 10 fatias do roadmap de frontend estão entregues, mas a SPA nunca chegou à
produção. O plano original (bucket+CDN atrás de load balancer com
`path_matcher` → Cloud Run, mesma origem) está bloqueado pela ausência de
domínio: `create_frontend_lb = var.frontend_domain != ""`
(`infra/terraform/locals.tf`) e o certificado gerenciado do Google só é
emitido para domínio real. Enquanto isso, `deploy.yml` só entrega a imagem da
API, o bucket da SPA está vazio e o comentário de `frontend.tf` ainda descreve
`apps/web` como "layout reservado".

Restrições que valem para qualquer solução:

- **Cookie de sessão** `HttpOnly` + `Secure` (produção) + `SameSite=Strict`,
  sem CORS (`apps/api/src/lib/session-cookie.ts`; design.md D1/D2 do change
  `web-shell-e-auth`). Exige **HTTPS e mesma origem** entre SPA e API.
- **Bytes de arquivos nunca passam pela API** — o serving da SPA é de assets
  da aplicação (JS/CSS/HTML públicos), não de documentos; bucket privado,
  URLs assinadas e TTLs por operação ficam intocados.
- **Paridade dev↔prod**: dev continua com Vite + proxy (`npm run dev:web`);
  o SessionStart hook não sobe a app.

## Goals / Non-Goals

**Goals:**

- Colocar a SPA em produção **hoje**, usando só URLs brutas da GCP, sem
  domínio, sem CORS e sem tocar na arquitetura de sessão.
- Deploy atômico: um artefato (imagem) entrega SPA+API; rollback de revisão
  do Cloud Run reverte as duas juntas.
- Deixar o caminho bucket+CDN+LB pronto e documentado para a fase com
  domínio, sem retrabalho.

**Non-Goals:**

- Provisionar LB/certificado/IP (fase com domínio, change futura).
- Publicar o `dist/` no bucket ou invalidar CDN (idem).
- Habilitar CORS, mudar o contrato de autenticação ou o tráfego de bytes.

## Decisions

### D1 — A SPA é servida pelo próprio Cloud Run da API (mesma origem em `*.run.app`)

A URL do serviço Cloud Run é a única URL bruta da GCP com TLS gerenciado que
pode ser a **mesma origem** de SPA e API. Alternativas descartadas:

- **URL pública do bucket** (`storage.googleapis.com/...`): outra origem em
  relação à API → o cookie `SameSite=Strict`/`Secure` nunca acompanha as
  chamadas; exigiria CORS + `SameSite=None`, desmontando o design de sessão.
- **LB por IP cru, sem certificado**: sem HTTPS o cookie `Secure` não
  trafega; servir a app em texto claro é inaceitável.
- **Segundo serviço Cloud Run só para a SPA**: `run.app` está na Public
  Suffix List — cada subdomínio de serviço é origem (e site) distinto; dois
  serviços nunca compartilham cookie. Além de custo/complexidade sem ganho.

Servir estático pela API é **interino e reversível**: quando o domínio
existir, o `path_matcher` do LB manda só os prefixos de API para a Cloud Run
e o estático embutido simplesmente deixa de ser alcançado — nenhum desmonte é
necessário para a fase 2.

### D2 — Fallback de `index.html` com guarda explícita de prefixos de API

Montagem em `app.ts`: `express.static(webDistDir, { index: false })` seguido
de um fallback que responde `index.html` **apenas** para `GET`/`HEAD` cujo
caminho **não** começa por um prefixo de API. A lista vive num módulo novo
(`apps/api/src/lib/api-prefixes.ts`) e espelha
`apps/web/vite.config.ts::API_PROXY_PREFIXES` e
`infra/terraform/locals.tf::api_proxy_prefixes`, com o mesmo comentário de
sincronia nas três pontas — **mais `/internal`** (o push do Pub/Sub é `POST`,
mas a guarda cobre qualquer método por robustez).

Por que a guarda, se os routers de API existem? Porque um caminho de API que
não casa com rota (ex.: `GET /files/rota-inexistente`) deve atravessar até o
404 padrão da API, nunca cair no fallback e devolver `index.html` com 200 —
um contrato de API silenciosamente corrompido. Com a guarda, sob prefixo de
API o comportamento é **exatamente o atual**, independente de onde o
fallback é montado.

**Posição real de montagem (achado durante a implementação, diverge do
parágrafo original desta decisão):** o serving da SPA é montado **depois**
de `health`/`storage-events`/`auth`, mas **antes** dos routers tenant-scoped
(`files`, `folders`, `users`, `grants`, `trash`, `audit`, `dashboard`,
`search`), não depois de todos como planejado inicialmente. Motivo: esses
routers eram montados via `app.use(attachTenantContext(ports), xRouter(ports))`
— sem path próprio, o Express aplica `attachTenantContext` a **qualquer**
caminho, não só aos do router. Um fallback montado depois desses `app.use`
seria interceptado por esse middleware antes de rodar: `GET /busca` sem
sessão devolveria `401` em vez do `index.html` esperado para um deep-link,
quebrando o requisito para visitantes não autenticados. A correção real foi
escopar `attachTenantContext` aos prefixos que os routers de fato atendem —
`app.use(['/files', '/folders', '/users', '/grants', '/trash', '/dashboard'],
attachTenantContext(ports))`, montado uma única vez antes dos routers (que
passaram a ser montados sem middleware acoplado). Isso também corrige, como
efeito colateral correto, um contrato pré-existente: hoje (antes deste
change) um caminho qualquer sem sessão e sem rota correspondente já
respondia `401` em vez do `404` padrão do Express — bug de escopo de
middleware anterior a este change, não introduzido por ele, mas que só se
tornou observável ao implementar o fallback da SPA.

### D3 — `WEB_DIST_DIR` opcional; ausente = comportamento de hoje; inválido = falha no arranque

`config.ts` ganha `webDistDir` (via `resolveRepoPath`, como
`STORAGE_SIGNER_KEY_PATH`). Sem a variável, `createApp` não monta nada de
estático — dev e testes atuais ficam intocados. **Definida mas apontando para
diretório inexistente/sem `index.html` → erro no arranque** (fail-fast): na
imagem de produção o caminho é garantido pelo Dockerfile, então essa condição
só ocorre por misconfiguração e deve gritar, não degradar silenciosamente
para uma API sem frontend. Para testes, `createApp(ports, { webDistDir })`
aceita a opção injetada (supertest com `dist/` de fixture), mantendo o
padrão de injeção já usado com `Ports`.

### D4 — Cache por classe de artefato

- `/assets/*` (nomes com hash de conteúdo gerados pelo Vite):
  `Cache-Control: public, max-age=31536000, immutable`.
- `index.html` (e o fallback): `Cache-Control: no-store` — cada deploy
  propaga imediatamente; o HTML é minúsculo e referencia assets imutáveis.
- Demais arquivos da raiz do `dist/` (ex.: favicon): sem cache agressivo
  (default do `express.static`).

### D5 — Dockerfile único embute o build da web; `deploy.yml` não muda

- **deps**: adiciona `COPY apps/web/package.json` antes do `npm ci` (o lock
  da raiz já cobre o workspace).
- **build**: copia `apps/web` e roda `npm run build --workspace apps/web`
  após o build do `shared` (o Vite consome `@gdoc/shared` compilado); o
  `npm prune --omit=dev` continua por último.
- **runtime**: `COPY --from=build /app/apps/web/dist ./apps/web/dist` e
  `ENV WEB_DIST_DIR=/app/apps/web/dist`.

O pipeline (`ci.yml` → `deploy.yml`) permanece byte a byte igual: a imagem
que ele já builda e implanta passa a conter a SPA. Deploy e rollback
continuam atômicos por revisão do Cloud Run.

## Risks / Trade-offs

- **[Deriva entre as três listas de prefixos]** (vite, terraform, api) → os
  comentários de sincronia passam a apontar as **três** pontas; a lista da
  API é a única com efeito em produção na fase sem domínio, e o teste de
  integração cobre o contrato (API nunca sombreada).
- **[Assets servidos por Node/Cloud Run, sem CDN]** → custo de CPU/latência
  maior que bucket+CDN; aceitável para o primeiro momento (assets são poucos
  e imutáveis no cache do browser). A fase com domínio devolve os assets ao
  CDN sem mudança de código.
- **[URL `*.run.app` exposta ao usuário final]** → estética/confiança de URL
  provisória; é exatamente o combinado ("URLs brutas fornecidas pela GCP")
  até existir domínio.
- **[`index.html` com `no-store`]** → um GET a mais por navegação de entrada;
  irrelevante em bytes e necessário para propagação imediata de deploy.

## Migration Plan

1. Merge em `main` → CI verde → `deploy.yml` entrega a imagem nova (nenhuma
   alteração de workflow ou Terraform necessária para servir).
2. Validar na URL do serviço (`https://<serviço>.run.app`): login (cookie na
   mesma origem), navegação com deep-link, upload/preview/download por URL
   assinada, painel admin.
3. Rollback, se preciso: `gcloud run services update-traffic` para a revisão
   anterior — SPA e API voltam juntas.
4. Fase futura (com domínio): change própria — `frontend_domain` no
   Terraform, publicação do `dist/` no bucket, invalidação de CDN no deploy.

## Open Questions

- Nenhuma bloqueante. A escolha de manter ou não o serving embutido após a
  fase com domínio pode ser decidida na change futura (mantê-lo é inócuo
  atrás do LB e preserva o ambiente sem domínio como fallback).
