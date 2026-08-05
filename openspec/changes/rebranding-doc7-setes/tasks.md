# Tasks — rebranding-doc7-setes

## 1. DTO compartilhado (packages/shared)

- [x] 1.1 Criar/estender módulo de contratos com `PublicConfigResponse`
  (`{ appName: string; clientName: string }`), exportado em
  `packages/shared/src/index.ts`.
- [x] 1.2 Rodar `npm run build --workspace packages/shared` (api e web consomem
  de `dist/`, não da fonte).

## 2. API — configuração e endpoint público

- [x] 2.1 `apps/api/src/config.ts`: adicionar `appClientName` lido de
  `process.env.APP_CLIENT_NAME`, **opcional**, default string vazia. Não passar
  pelo `SecretsPort` — é dado público (design.md D8).
- [x] 2.2 `apps/api/src/routes/auth.ts`: adicionar `GET /auth/public-config`
  **sem** `attachTenantContext`, devolvendo apenas `{ appName, clientName }`
  (design.md D4). Não abrir transação tenant.
- [x] 2.3 `apps/api/src/server.ts`: log de boot passa a `Doc7 API listening…`.
- [x] 2.4 Confirmar que nenhum prefixo novo foi introduzido — `api-prefixes.ts`,
  `apps/web/vite.config.ts` e `infra/terraform/locals.tf` **não** devem ser
  alterados (design.md D2).

## 3. Web — bootstrap e exibição

- [x] 3.1 `apps/web/src/auth/session-context.tsx`: buscar `/auth/public-config`
  **em paralelo** ao `GET /auth/me` do bootstrap, resolvendo o gate
  `status: 'loading'` só quando ambas concluírem (design.md D7). Falha da
  configuração ⇒ `clientName` vazio, nunca bloqueio.
- [x] 3.2 Expor a identidade visual pelo contexto para consumo do login e do
  shell.
- [x] 3.3 `apps/web/index.html`: `<title>` para **`Doc7`** — apenas o nome, sem a
  identificação do cliente (design.md D9: literal no HTML estático reintroduziria
  o hardcode que esta change remove).
- [x] 3.3a Compor `document.title` como `{appName} - {clientName}` quando houver
  identificação, num **único** ponto após a resolução do bootstrap. Sem
  identificação, manter o título estático.
- [x] 3.4 `apps/web/src/auth/LoginPage.tsx`: heading para `Doc7`; identificação
  do cliente como elemento **irmão**, abaixo do heading e acima de "Acesse sua
  conta" — preservando o nome acessível puro do heading (design.md D6). Manter o
  comentário que explica o cuidado, atualizando a referência ao nome.
- [x] 3.5 `apps/web/src/shell/AppShell.tsx`: marca `'GD'`/`'GDoc'` → `'D7'`/`'Doc7'`;
  identificação do cliente abaixo da marca **apenas no estado expandido**, em tipo
  menor e cor secundária; não renderizar no colapsado.
- [x] 3.6 `apps/web/src/app/HomePage.tsx`: "Bem-vindo ao Doc7".

## 4. Configuração de ambiente e infraestrutura

- [x] 4.1 `.env.example`: acrescentar `APP_CLIENT_NAME=SETES` com comentário de
  que vazio significa "sem identificação de cliente".
- [x] 4.2 **(infra/Terraform)** Declarar `APP_CLIENT_NAME` como variável de
  ambiente comum do serviço Cloud Run da API — **não** como secret (design.md
  D8), com valor default configurável por `terraform.tfvars`.
- [x] 4.3 **(paridade de sandbox)** Verificar que `.claude/hooks/session-start.sh`
  não precisa de ajuste — a variável é opcional e o `.env` local espelha o
  `.env.example`. Nenhuma mudança esperada; confirmar. Confirmado: o hook só
  copia `.env.example` → `.env` quando ausente, sem tratar variáveis
  específicas.

## 5. Testes

- [x] 5.1 Atualizar a âncora de nome nos testes existentes de web: `login.test.tsx`,
  `require-auth.test.tsx`, `painel.test.tsx`, `role-guard.test.tsx`,
  `unidades.test.tsx`, `minha-conta.test.tsx` (`'GDoc'` → `'Doc7'`,
  `'Bem-vindo ao GDoc'` → `'Bem-vindo ao Doc7'`). `minha-conta.test.tsx` não
  ancorava `'GDoc'` (só o import `@gdoc/shared`, inalterado por D5) — conferido,
  nenhuma mudança necessária.
- [x] 5.2 Novo caso: com `clientName` configurado, o login exibe a identificação
  **e** o nome acessível do heading permanece exatamente `Doc7`
  (`getByRole('heading', { name: 'Doc7' })`).
- [x] 5.3 Novo caso: com `clientName` vazio, nenhuma identificação é renderizada e
  a tela de login segue funcional.
- [x] 5.4 Novo caso: falha na obtenção da configuração pública não impede o
  bootstrap nem o login.
- [x] 5.5 Novo caso (shell): identificação visível no estado expandido e ausente
  no colapsado.
- [x] 5.5a Novo caso: `document.title` compõe `Doc7 - SETES` com identificação
  configurada, e permanece `Doc7` sem ela.
- [x] 5.6 **(API)** Novo caso: `GET /auth/public-config` responde `200` **sem
  cookie de sessão**, e a resposta contém apenas `appName` e `clientName`.
- [x] 5.7 Confirmar que `__tests__/web-serving.test.ts` continua passando sem
  alteração (nenhum prefixo novo).

## 6. Documentação

- [x] 6.1 `docs/manual_do_usuario.md`: título, seção 1 e rodapé — `GDoc` → `Doc7`;
  mencionar a identificação da organização na descrição da tela (seção 4).
- [x] 6.2 `README.md` e `docs/frontend_roadmap.md`: nome exibido.
- [x] 6.3 Registrar em `README.md` (ou na seção de configuração) que
  `APP_CLIENT_NAME` é por implantação e que identificadores internos (`@gdoc/*`,
  `name_prefix`) permanecem inalterados por decisão (design.md D5).

## 7. Verificação

- [x] 7.1 `npm run lint && npm run build && npm run test` na raiz.
- [x] 7.2 Subir a app (`make dev-api` + `npm run dev:web`) e conferir
  visualmente: login com `Doc7` + `SETES`, shell expandido/colapsado, título da
  aba. Confirmado por screenshot (Playwright): heading "Doc7" puro, "SETES"
  abaixo, `<title>` "Doc7 - SETES"; shell expandido com "Doc7"/"SETES", colapsado
  só "D7".
- [x] 7.3 Conferir com `APP_CLIENT_NAME` vazia que nada quebra. Confirmado:
  `GET /auth/public-config` devolve `clientName: ""`, login sem subtítulo,
  `<title>` só "Doc7", tela plenamente funcional.
