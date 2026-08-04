# Proposal — rebranding-doc7-setes

## Why

O produto foi batizado internamente como **GDoc**, e esse nome está cravado na
camada de apresentação (`<title>`, tela de login, sider do shell, tela de
Início). O cliente definiu o nome comercial **Doc7** e pediu que a identificação
do cliente — **SETES** — apareça logo abaixo do nome da aplicação.

São dois problemas de natureza diferente:

1. **O nome está hardcoded.** Trocar `GDoc` por `Doc7` é substituição de texto,
   mas hoje não existe nenhum ponto de configuração — o próximo cliente repetiria
   o mesmo trabalho.
2. **A identificação do cliente precisa aparecer na tela de login, que é
   pré-autenticação.** O SPA hoje **não lê nenhuma variável de ambiente** (zero
   ocorrências de `import.meta.env`/`VITE_` fora de `vite.config.ts`) e **não
   existe endpoint público**: `GET /auth/me` e `GET /auth/profile` passam por
   `attachTenantContext` e respondem `401` antes do login. Não há por onde
   entregar `SETES` à tela onde ele precisa aparecer.

Esta mudança troca o nome, introduz a identificação do cliente como **valor
configurado** (`APP_CLIENT_NAME`) e cria o canal mínimo para entregá-la ao SPA
antes da autenticação.

## What Changes

- **Nome da aplicação `GDoc` → `Doc7`** em toda a camada de apresentação:
  `apps/web/index.html` (`<title>`), `apps/web/src/auth/LoginPage.tsx` (heading),
  `apps/web/src/shell/AppShell.tsx` (marca no sider, incluindo a forma curta do
  estado colapsado: `GD` → `D7`), `apps/web/src/app/HomePage.tsx` e o log de boot
  em `apps/api/src/server.ts`. Documentação (`README.md`,
  `docs/manual_do_usuario.md`, `docs/frontend_roadmap.md`) acompanha.
- **Identificação do cliente configurável** — nova variável de ambiente
  `APP_CLIENT_NAME` (server-side, seguindo a convenção do `.env.example`; em
  produção vem do Secret Manager/env do Cloud Run). Valor de implantação atual:
  `SETES`. Vazia ou ausente ⇒ nenhum subtítulo é exibido, sem erro.
- **Endpoint público de identidade visual** — `GET /auth/public-config`,
  **anônimo por natureza** (a tela de login é pré-autenticação), devolvendo
  exclusivamente `{ appName, clientName }`. Pendurado no prefixo `/auth`, que já
  existe nas três listas de prefixo — **não** introduz prefixo de topo novo e
  portanto não mexe no invariante de sincronia `api-prefixes.ts` ↔
  `vite.config.ts` ↔ `locals.tf`.
- **Exibição do subtítulo** na tela de login e no shell, **fora** do elemento de
  heading, preservando o nome acessível do título como o nome da aplicação puro
  (padrão que `LoginPage.tsx` já adota deliberadamente para o ícone).
- **Testes** que ancoram o nome (`login.test.tsx`, `require-auth.test.tsx`,
  `painel.test.tsx`, `role-guard.test.tsx`, `unidades.test.tsx`,
  `minha-conta.test.tsx`) passam a ancorar `Doc7`, mais cobertura nova do
  subtítulo e da ausência dele quando `APP_CLIENT_NAME` é vazia.

Fora de escopo (registrado em design.md):

- **Renomear identificadores internos.** O scope npm `@gdoc/*` (109 ocorrências),
  `gdoc_dev`/`gdoc_ci`, `gdoc-dev-bucket`, `db_user = "gdoc_app"` e sobretudo
  `name_prefix = "gdoc"` em `infra/terraform/variables.tf` **permanecem como
  estão** — trocar `name_prefix` faz o Terraform **destruir e recriar** bucket de
  storage, instância Cloud SQL e tópico Pub/Sub, o que em produção é perda de
  dados, não renomeação. Ver D5.
- **Logo/ícone, paleta e tipografia** — a marca visual continua o `FolderOutlined`
  sobre `colorPrimary`. Só o texto muda.
- **Marca por unidade** (cada unidade com sua própria identificação) — a
  configuração é por implantação, não por tenant. Ver D3.
- **i18n / nome traduzível** — fora.

## Capabilities

### New Capabilities

- `identidade-visual`: nome da aplicação e identificação do cliente como
  propriedade **configurada por implantação**, entregues ao SPA por um endpoint
  público restrito a branding, exibidas na tela de login e no shell sem
  contaminar o nome acessível do heading, e degradando para "sem subtítulo"
  quando não configuradas.

### Modified Capabilities

<!-- Nenhum requisito verificável já publicado é reescrito. `web-shell-e-auth`
     ("Shell de layout com identidade e navegação") trata da identidade **do
     usuário** (nome, papel, logout) e do respeito ao papel na navegação — nada
     ali normatiza a marca do produto, então o requisito permanece válido sem
     alteração. `publicacao-frontend` também segue intacto: `/auth/public-config`
     cai sob um prefixo de API já normatizado por "Rotas de API nunca sombreadas
     pelo estático", sem acrescentar prefixo novo. -->

## Impact

- **API (`apps/api/src`):** `config.ts` ganha `appClientName` lido de
  `APP_CLIENT_NAME` (opcional, default vazio); `routes/auth.ts` ganha
  `GET /auth/public-config` **sem** `attachTenantContext`; `server.ts` passa a
  logar `Doc7 API`. Nenhuma rota existente muda de comportamento.
- **Web (`apps/web/src`):** `index.html` (`<title>`); `LoginPage.tsx` e
  `AppShell.tsx` passam a consumir a configuração pública; `HomePage.tsx`;
  o bootstrap da sessão em `session-context.tsx` busca a configuração pública em
  paralelo, **dentro do gate `status: 'loading'` que já existe** (sem flash de
  conteúdo e sem estado de carregamento novo).
- **Shared (`packages/shared/src`):** DTO `PublicConfigResponse`
  (`{ appName, clientName }`); rebuild de `dist`.
- **Config de ambiente:** `APP_CLIENT_NAME` acrescentada a `.env.example`; em
  produção, variável do serviço Cloud Run em `infra/terraform` (valor não é
  segredo — é texto exibido publicamente na tela de login — então vai como env
  var comum, não Secret Manager).
- **Testes:** atualização dos seis testes de web que ancoram o nome; novos casos
  para o subtítulo presente/ausente e para `GET /auth/public-config` responder
  sem sessão.
- **Docs:** `README.md`, `docs/manual_do_usuario.md`, `docs/frontend_roadmap.md`.
- **Sem migração de banco** e **sem mudança na paridade do sandbox** — o
  SessionStart hook não é afetado.
