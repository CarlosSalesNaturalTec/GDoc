# Tasks — epico-1-auth-e-pessoas

Ordem por dependência: schema → seam de sessão → resolução de identidade →
rotas de auth → CRUD de pessoas → seed → paridade dev/testes → prova ponta a
ponta. Somente backend (apps/api); nenhuma feature de frontend.

## 1. Banco: campos de pessoa e status

- [ ] 1.1 Criar migração `0003_people_fields.sql` (arquivo novo, não editar a
      `0001`) adicionando a `users`: `full_name`, `phone`, `job_title`,
      `work_area`, `notes` e `status text NOT NULL DEFAULT 'active' CHECK (status
      IN ('active','disabled'))`
- [ ] 1.2 Confirmar que `users` segue sob `FORCE ROW LEVEL SECURITY` e que a policy
      existente (`unit_id = current_setting('app.current_unit') OR user_role =
      'global_admin'`) já cobre as colunas novas — sem policy nova
- [ ] 1.3 Rodar `npm run migrate --workspace apps/api` e conferir `schema_migrations`

## 2. Seam de sessão (AuthPort)

- [ ] 2.1 Estender `ports/auth-port.ts` com `issueSession(claims)` e
      `verifySession(token)` (além do hash/verify de senha já existente)
- [ ] 2.2 Implementar no adapter (argon2/JWT) a assinatura/verificação HMAC-SHA256
      lendo `AUTH_SESSION_SECRET` **via `SecretsPort`**, nunca de `process.env`
- [ ] 2.3 Definir TTL da sessão (proposta 8h) e payload mínimo (`sub`, `exp`); não
      confiar unit/role do token
- [ ] 2.4 Teste unitário: emitir → verificar (válido); token adulterado/expirado é
      rejeitado

## 3. Resolução de identidade (substituir o placeholder)

- [ ] 3.1 Reescrever `middleware/tenant-context.ts` para resolver a identidade da
      sessão (cookie `HttpOnly`) em vez de `x-gdoc-user-id`, mantendo a assinatura
      `attachTenantContext(ports)` e o `req.tenantContext`
- [ ] 3.2 A resolução relê `unit_id`, papel e `status` do banco por requisição
      (sob bypass para o lookup) e recusa sessão de conta ausente ou `disabled`
- [ ] 3.3 Preservar o `SET LOCAL app.current_unit` / `app.user_role` por transação
      nas rotas (nenhuma mudança no mecanismo de RLS)
- [ ] 3.4 Adicionar `cookie-parser` (ou equivalente) no `app.ts`

## 4. Rotas de autenticação

- [ ] 4.1 `routes/auth.ts`: `POST /auth/login` — verifica senha via `AuthPort`,
      recusa conta `disabled`, emite cookie de sessão; resposta genérica para
      credenciais inválidas (não revela usuário vs. senha)
- [ ] 4.2 `POST /auth/logout` — limpa o cookie de sessão
- [ ] 4.3 `GET /auth/me` — devolve id/unidade/papel da sessão, sem senha/hash
- [ ] 4.4 Montar `/auth/*` no `app.ts` **antes** do middleware que exige sessão;
      manter `/files/*` e `/users/*` atrás do middleware

## 5. CRUD de pessoas

- [ ] 5.1 DTOs em `packages/shared` (login, criação/edição de pessoa, enum de
      status) e rebuild do `packages/shared`
- [ ] 5.2 `routes/users.ts`: `POST /users` — só `global_admin`/`unit_admin`; hash da
      senha inicial; e-mail duplicado → erro claro; `unit_admin` forçado à própria
      unidade e proibido de criar `global_admin`
- [ ] 5.3 `GET /users` — listagem restrita pelo alcance (RLS filtra unit_admin;
      global_admin agrega)
- [ ] 5.4 `PATCH /users/:id` — editar dados e alternar `status` ativo/desativado,
      dentro do alcance; desativar preserva arquivos e auditoria
- [ ] 5.5 `collaborator` recebe 403 em todas as rotas de `/users`

## 6. Bootstrap do primeiro administrador

- [ ] 6.1 Atualizar `db/seed.ts` para criar um `global_admin` inicial de forma
      idempotente (só se não houver nenhum `global_admin`), lendo credenciais de env
      (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`)
- [ ] 6.2 Acrescentar as chaves de bootstrap ao `.env.example`

## 7. Paridade dev e testes

- [ ] 7.1 Atualizar helpers de teste (`__tests__/test-db.ts`) para emitir uma sessão
      válida em vez de setar `x-gdoc-user-id`, mantendo os testes de RLS e de
      permissão existentes verdes
- [ ] 7.2 Testes de auth: login válido/ inválido/ conta desativada; `me`; logout
      (cobrindo os cenários da spec `autenticacao`)
- [ ] 7.3 Testes de pessoas: cadastro válido; e-mail duplicado; alcance
      global vs. unidade; colaborador bloqueado; desativação preserva dados
      (cobrindo os cenários da spec `gestao-pessoas`)
- [ ] 7.4 `npm run lint`, `npm run build`, `npm run test` verdes na raiz

## 8. Prova ponta a ponta

- [ ] 8.1 Fluxo em dev: seed cria admin → `POST /auth/login` (cookie) →
      `POST /users` cria colaborador → login do colaborador → `GET /auth/me`
- [ ] 8.2 Verificar isolamento: `unit_admin` da unidade A não lista nem edita pessoa
      da unidade B (403/vazio) e link/sessão de outra unidade não vaza dados
- [ ] 8.3 Verificar que desativar uma conta encerra o acesso na próxima requisição,
      mesmo com sessão ainda não expirada
