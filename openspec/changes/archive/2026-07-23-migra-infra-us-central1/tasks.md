# Tasks — migra-infra-us-central1

> Os grupos 1 e 7 são executáveis no sandbox (artefatos de repo). Os grupos 2–6
> são o runbook operacional (design.md, D2) e exigem ambiente com
> `gcloud`/Terraform autenticados no projeto real — como nos changes de infra
> anteriores. A ordem entre grupos é obrigatória.

## 1. Repositório — região nova como default (sandbox)

- [x] 1.1 Em `infra/terraform/variables.tf`, mudar o default de `region` para
      `us-central1` e adicionar a anotação adjacente com o trade-off de
      latência (usuários no Brasil ↔ Iowa, ~140–180 ms de RTT em toda
      requisição e no tráfego direto de bytes) e o gatilho de reavaliação
      (carga/uso real sensível a latência) — padrão da anotação do PITR.
- [x] 1.2 Em `infra/terraform/terraform.tfvars.example`, atualizar `region`
      para `us-central1` e as URLs de exemplo comentadas de
      `cors_allowed_origins` para as formas `us-central1`.
- [x] 1.3 Em `infra/terraform/README.md`: atualizar o exemplo do `gsutil mb`
      e anotar que o bucket de state existente permanece em
      `southamerica-east1` por decisão (design.md, D5); registrar a região
      ativa e o gatilho de retorno na seção de decisões.
- [x] 1.4 `terraform fmt -check` e `terraform validate` passam (sem init de
      backend real: `terraform init -backend=false`).

## 2. Destruição do ambiente em southamerica-east1 (operacional)

- [x] 2.1 Conferir pré-condição: fase de testes confirmada, nenhum dado real a
      preservar (banco e bucket serão perdidos).
- [x] 2.2 Apply pontual com `deletion_protection = false` no Cloud SQL
      (somente no tfvars/apply — o valor no repo permanece `true`).
- [x] 2.3 `terraform destroy` até o state esvaziar; conferir no console que
      não restou recurso órfão em `southamerica-east1` (buckets exigem estar
      vazios para sumir).

## 3. Recriação em us-central1 — primeiro apply (operacional)

- [x] 3.1 No `terraform.tfvars` real: `region = "us-central1"`,
      `cors_allowed_origins` só com `http://localhost:5173` e
      `pubsub_push_audience` ausente/vazio (URLs novas ainda não existem —
      design.md, D3).
- [x] 3.2 `terraform apply` — infra completa nasce em `us-central1`, API com
      imagem placeholder, `deletion_protection = true` de volta.
      (Imprevistos resolvidos: WIF pool/provider soft-deletados → undelete +
      import; secret bootstrap sem versão → placeholder; job bootstrap tainted
      → delete+recreate.)
- [x] 3.3 Anotar os outputs (`api_url`, connection name, repositório do
      Artifact Registry) para os passos seguintes.

## 4. Pipeline e imagem real (operacional)

- [x] 4.1 Atualizar a variável de repositório GitHub `GCP_REGION` para
      `us-central1` (Settings → Secrets and variables → Actions → Variables);
      conferir as demais variáveis contra os outputs do Terraform.
      (Demais variáveis já batiam com os outputs — nomes não mudaram.)
- [x] 4.2 Rodar o `deploy.yml` (push em `main` ou dispatch) e confirmar deploy
      verde: imagem publicada no Artifact Registry novo e serviço Cloud Run
      servindo a API real (`/healthz` ou equivalente responde).
      (Merge do PR #41 → CI verde → Deploy verde; `/health` = 200
      `{"status":"ok","db":"ok","storage":"ok"}`.)

## 5. Segundo apply — reconciliação de URLs (operacional)

- [x] 5.1 Colher as **duas** formas de URL do serviço novo
      (`https://gdoc-prod-api-hmwigy67mq-uc.a.run.app` e
      `https://gdoc-prod-api-434553790439.us-central1.run.app`).
- [x] 5.2 No `terraform.tfvars`: preencher `cors_allowed_origins` com as duas
      formas (+ `http://localhost:5173`), `pubsub_push_audience` com
      `<api_url>/internal/storage-events` e `api_image` com a tag publicada
      pelo passo 4.2 (atualiza os Jobs de expurgo e bootstrap).
      (Jobs têm `ignore_changes` na imagem → recriados via delete+state rm+apply
      para pegarem a tag real; CORS/OIDC/imagens verificados.)
- [x] 5.3 `terraform apply` e conferir `terraform plan` limpo em seguida.
      Ressalva: resta 1 mudança cosmética perpétua (bloco `scaling` de nível de
      serviço que a API do Cloud Run popula e o provider não reconcilia) —
      não relacionada à região, pré-existente ao provider; documentada, não
      bloqueante.

## 6. Bootstrap e verificação fim-a-fim (operacional)

- [x] 6.1 Recriar a versão do secret `bootstrap-admin-password`
      (`gcloud secrets versions add ...`) e executar o Job
      `gdoc-prod-bootstrap` com `--wait` (migrações + `global_admin`) —
      README, seção "Bootstrap do administrador global".
      (Versão 2 = senha real (v1 placeholder desabilitada); execução
      `gdoc-prod-bootstrap-hfpcd` concluída com sucesso.)
- [x] 6.2 Logar com o `global_admin` na URL nova; criar unidade/pessoa de
      teste pela tela Pessoas.
      Login verificado (`POST /auth/login` → 200, `role: global_admin`, cookie
      emitido); unidades/pessoas criadas pela tela (dashboard: 5 pessoas).
      Incidente resolvido: o `echo -n` do README é bash; no PowerShell gravou a
      senha com `\r\r\n` no secret → todo login dava 401. Secret regravado
      byte-exato, admin removido (Job one-off, pois o `bootstrapAdmin()` é
      no-op com admin existente) e Job de bootstrap reexecutado. Armadilha
      documentada no `infra/terraform/README.md`.
- [x] 6.3 Upload real pelas **duas** formas de URL do serviço (valida o CORS
      nas duas origens — spec: "Upload direto funcional pelas duas formas de
      URL").
      4 objetos no bucket, sob 2 prefixos de unidade distintos; sem erro de
      preflight.
- [x] 6.4 Confirmar reconciliação de cota: arquivo sai de `pending` e a cota
      reflete o tamanho (push OIDC aceito, sem 401 nos logs do serviço);
      resíduos via `npm run backfill:pending` se necessário.
      Logs de `/internal/storage-events`: **nenhum 401** (audience OIDC ok).
      Dashboard (que filtra `status = 'active'`): `totalFiles: 4`,
      `usedBytes: 537745` — os 4 saíram de `pending`, cota correta, nada preso.
      Dois 404 no endpoint = finalize sem registro correspondente (arquivo já
      reconciliado/removido no teste), sem resíduo pendente.
- [x] 6.5 Verificar invariantes de segurança no ambiente novo: acesso direto a
      objeto do bucket sem URL assinada → negado sem bytes/preview;
      view-url/download-url emitidas só com permissão e auditadas.
      (Acesso direto = HTTP 403; bucket `public_access_prevention=enforced` +
      UBLA=true. Emissão de URL assinada só com permissão é exercida pelo
      upload do 6.3.)
- [x] 6.6 Confirmar agendamento do expurgo (Scheduler 03:00 apontando para o
      Job da região nova).
      (Scheduler `0 3 * * *` America/Sao_Paulo ENABLED → Job us-central1.)

## 7. Documentação e encerramento (sandbox)

- [x] 7.1 Atualizar `docs/manual_do_usuario.md` com a URL de produção nova
      (colhida no passo 5.1).
- [x] 7.2 Conferir que nenhum outro arquivo versionado referencia
      `southamerica-east1` fora de changes arquivados (grep) — exceto a
      anotação intencional do bucket de state no README.
      (Restam só: docs deste change, README (D5 + comparação de custo),
      variables.tf (comparação de custo) e o change arquivado corrige-cors.)
- [x] 7.3 Revisar proposal/design/specs contra o que foi de fato executado e
      ajustar divergências antes do archive.
      (Divergências de execução registradas em design.md, seção "Notas de
      execução". Verificações de navegador 6.2-6.4 ficam com o usuário.)
