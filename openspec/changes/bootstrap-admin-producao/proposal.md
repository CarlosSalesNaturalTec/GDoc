## Why

O GDoc está em produção (Cloud Run + Cloud SQL), mas **não há caminho seguro
para criar o primeiro administrador**. A aplicação não migra nem faz seed no
boot (`server.ts` só sobe o Express), e nem o `deploy.yml` nem o Terraform
rodam essa inicialização. O único mecanismo que cria um `global_admin` é o
**seed de desenvolvimento** (`apps/api/src/db/seed.ts`), que tem dois problemas
graves em produção:

1. **Cria dados de demonstração num banco vazio** — duas unidades de exemplo e
   três usuários (`colaborador.a@gdoc.dev`, `admin.a@gdoc.dev`,
   `colaborador.b@gdoc.dev`) **com a senha pública `dev-password-only`** —, uma
   brecha de segurança (e-mails previsíveis + senha conhecida).
2. **Cai em credenciais inseguras por padrão** — o Cloud Run não define
   `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD`, então `config.ts` usa os
   defaults de dev (`admin.global@gdoc.dev` / `dev-password-only`).

Além disso, rodar o seed hoje exige um **Cloud SQL Auth Proxy local** (o Cloud
SQL não tem rede pública), acoplando o bootstrap à máquina do operador.

## What Changes

- **Novo comando de bootstrap de produção** (`npm run bootstrap`, entrypoint
  `apps/api/src/db/bootstrap.ts`) que:
  - **aplica as migrações pendentes** e, em seguida, cria **apenas** o
    `global_admin` inicial numa unidade real (`BOOTSTRAP_ADMIN_UNIT`, padrão
    "Administração") — **nunca** dados de demonstração;
  - **exige** `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` e **falha
    (exit ≠ 0)** se ausentes, vazios ou iguais ao default inseguro conhecido
    (`dev-password-only`) — **fail-closed**, sem cair em credenciais de dev;
  - é **idempotente**: se já existe qualquer `global_admin`, é no-op e sai com
    sucesso (permite reexecução segura do Job).
- **Trava do seed de dev em produção** — `seed.ts` passa a **recusar-se a
  executar** quando `NODE_ENV=production`, fechando o furo dos dados de
  demonstração com senha pública mesmo se alguém rodar `npm run seed` por engano.
- **Cloud Run Job de bootstrap** (Terraform) que roda a **mesma imagem da API**
  com o entrypoint do bootstrap, conectado ao Cloud SQL pela integração nativa
  do Cloud Run — executado **uma vez, sob demanda** (`gcloud run jobs execute`),
  **sem exigir proxy local**. Não é agendado.
- **Segredo do Secret Manager** para `BOOTSTRAP_ADMIN_PASSWORD` (o operador
  define o valor antes de executar o Job); e-mail e unidade vão como variáveis
  de configuração do Job.
- **Documentação**: passo de bootstrap único no `infra/terraform/README.md`,
  substituindo qualquer orientação de usar o seed de dev para inicializar
  produção.

### Fora de escopo (mudanças futuras)

- **Redeploy automático da imagem do Job pelo CI/CD** — segue o mesmo padrão já
  documentado do Job de expurgo (imagem só avança em `terraform apply`); não é
  alterado aqui.
- **Autocadastro, convite por e-mail, rotação/reset de senha via UI** — fora do
  MVP (PRD §3). Após o bootstrap, todo o resto é criado pela tela **Pessoas**.
- **Redefinição da senha do bootstrap** após o primeiro login — o admin pode
  criar sua conta definitiva e desativar a de bootstrap pela tela Pessoas.

## Capabilities

### New Capabilities

- `bootstrap-producao`: inicialização segura do ambiente de produção — criação
  do administrador global inicial (e somente dele) a partir de credenciais
  obrigatórias, de forma idempotente, executável como Cloud Run Job sem acesso
  de rede direto ao banco; e a garantia de que o seed de dados de demonstração
  nunca roda em produção.

### Modified Capabilities

_Nenhuma_ — os requisitos de `platform-infrastructure` (storage privado, URLs
assinadas, RLS, cotas, provisionamento de dev) e de `gestao-pessoas` (cadastro
pela administração) não mudam. Este change adiciona o passo de inicialização
que antecede o primeiro uso, sem redefinir comportamento existente.

## Impact

- **`apps/api`**: novo `src/db/bootstrap.ts` e script `bootstrap` no
  `package.json`; guarda de `NODE_ENV=production` em `src/db/seed.ts`; novos
  testes `src/__tests__/bootstrap.test.ts` (falha sem envs, cria só o admin,
  idempotência, nunca cria demo data).
- **`infra/terraform`**: novo `google_cloud_run_v2_job` de bootstrap (mesma
  imagem/SA/integração Cloud SQL do serviço), novo secret
  `bootstrap-admin-password` + binding de acesso para a service account;
  `README.md` atualizado com o passo único.
- **Banco/produção**: nenhuma migração nova; a inicialização passa a criar
  apenas o `global_admin`. Sem impacto em dev além da trava de produção no seed
  (o fluxo `npm run seed` de dev continua idêntico).
- **`apps/web`, `packages/shared`**: intocados.
