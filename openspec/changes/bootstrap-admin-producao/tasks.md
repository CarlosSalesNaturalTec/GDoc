## 1. Comando de bootstrap (apps/api)

- [ ] 1.1 Criar `apps/api/src/db/bootstrap.ts` que: lê `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` direto de `process.env` e aborta (exit 1, sem tocar o banco) se ausentes, vazios ou senha igual a `dev-password-only` (D3); lê opcionais `BOOTSTRAP_ADMIN_UNIT` (padrão "Administração") e `BOOTSTRAP_ADMIN_NAME` (padrão "Administrador Global").
- [ ] 1.2 No bootstrap, aplicar migrações via `runMigrations()` (reuso de `db/migrate.ts`) antes de criar o admin (D2).
- [ ] 1.3 Idempotência (D4): se já existe algum `global_admin`, no-op com log e exit 0. Caso contrário, numa transação com `SET LOCAL app.user_role = 'global_admin'`, criar/reaproveitar a unidade por nome e inserir o `global_admin` com hash argon2; colisão de e-mail aborta com mensagem clara.
- [ ] 1.4 Exportar `bootstrapAdmin(pool?)` (testável, aceitando pool injetado) e um bloco `import.meta.url === ...` para execução como script, no mesmo padrão de `migrate.ts`/`seed.ts`.
- [ ] 1.5 Adicionar script `"bootstrap": "tsx src/db/bootstrap.ts"` em `apps/api/package.json`.

## 2. Trava de produção no seed de dev

- [ ] 2.1 Em `apps/api/src/db/seed.ts`, abortar (throw/exit 1) quando `config.nodeEnv === 'production'`, antes de qualquer escrita (D5), com mensagem apontando o comando de bootstrap.

## 3. Testes (apps/api)

- [ ] 3.1 Criar `apps/api/src/__tests__/bootstrap.test.ts`: falha quando faltam `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` e não escreve nada.
- [ ] 3.2 Teste: recusa senha `dev-password-only` e não escreve nada.
- [ ] 3.3 Teste: banco vazio ⇒ cria exatamente um `global_admin` na unidade informada e **nenhum** usuário/unidade de demonstração.
- [ ] 3.4 Teste: idempotência ⇒ reexecutar com um `global_admin` presente é no-op (nenhuma criação/alteração) e sucesso.
- [ ] 3.5 Teste do seed: aborta quando `NODE_ENV=production` e permanece com o comportamento atual fora de produção.

## 4. Infra (infra/terraform)

- [ ] 4.1 Criar secret container `${local.name_prefix}-bootstrap-admin-password` (sem versão gerenciada pelo Terraform) em `secret_manager.tf` e conceder `secretAccessor` à service account da API (D7).
- [ ] 4.2 Criar `google_cloud_run_v2_job` `${local.name_prefix}-bootstrap` (novo arquivo, ex.: `bootstrap_job.tf`), espelhando o Job de expurgo: mesma `var.api_image`, `command`/`args` = `node apps/api/dist/db/bootstrap.js`, volume + conexão Cloud SQL, SA da API, `DATABASE_URL` do secret existente, `BOOTSTRAP_ADMIN_PASSWORD` do novo secret, `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_UNIT` como env, e `STORAGE_BUCKET`/`GCP_PROJECT_ID` reais (config exige no load). Não agendado; `lifecycle.ignore_changes` na imagem como nos demais.
- [ ] 4.3 Adicionar variável `bootstrap_admin_email` (e opcional `bootstrap_admin_unit`) em `variables.tf` + `terraform.tfvars.example`.

## 5. Documentação

- [ ] 5.1 Atualizar `infra/terraform/README.md` com o passo único de bootstrap (criar versão do secret da senha → definir e-mail → `gcloud run jobs execute ...`), substituindo qualquer orientação de usar o seed de dev para inicializar produção; incluir a limpeza de contas de demonstração pré-existentes pela tela Pessoas.

## 6. Verificação

- [ ] 6.1 Rodar `npm run lint`, `npm run build` e `npm run test` (workspace apps/api) e garantir verde; `terraform fmt`/`validate` em `infra/terraform`.
