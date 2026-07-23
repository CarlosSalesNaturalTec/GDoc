# Design — migra-infra-us-central1

## Context

Toda a infra regional de produção vive em `southamerica-east1` e a região já é
100% parametrizada em `var.region` (`infra/terraform/variables.tf`) — nenhum
recurso `.tf` referencia região literal. O que amarra o ambiente à região, na
prática, são artefatos **derivados** dela:

```
                       var.region
                           │
     ┌─────────────┬───────┴──────┬──────────────┬─────────────┐
     ▼             ▼              ▼              ▼             ▼
 Cloud Run     Cloud SQL      Buckets GCS    Artifact      Scheduler/
 (URL contém   (instância     (files + web)  Registry      Jobs + NEG
  a região)     regional)                     (host da img)
     │
     ├── cors_allowed_origins (tfvars) ── CORS do bucket de arquivos
     ├── pubsub_push_audience (tfvars) ── validação OIDC do push
     ├── GCP_REGION (variável GitHub) ─── deploy.yml (push de imagem + deploy)
     └── docs/manual_do_usuario.md ────── URL divulgada
```

Recursos regionais do GCP não mudam de região in-place. A aplicação está em
fase de testes, sem dados reais — destruir e recriar tem custo de dados zero.
O diagnóstico completo e a motivação estão no `proposal.md`.

## Goals / Non-Goals

**Goals:**

- Infra de produção inteira operando em `us-central1`, com `terraform plan`
  limpo (sem drift) ao final.
- Repositório refletindo a região nova como default (variables.tf, exemplos,
  README) — o repo carrega a intenção, não só o tfvars local.
- As três pontas derivadas da URL do Cloud Run (CORS, audience OIDC,
  `GCP_REGION`) reconciliadas no ambiente novo, com upload e reconciliação de
  cota comprovadamente funcionais.
- Trade-off de latência registrado com gatilho de reavaliação, no mesmo padrão
  do PITR.

**Non-Goals:**

- Migrar dados (não existem dados reais — banco e bucket recomeçam vazios).
- Mover o bucket de state do Terraform (fica em `southamerica-east1`).
- Alterar qualquer código de aplicação, migration ou seam — a região é
  invisível atrás dos ports.
- Zero-downtime: a janela de indisponibilidade é aceita.

## Decisions

### D1 — Destruir e recriar via Terraform, não "blue/green" entre regiões

Alternativa considerada: subir a infra nova em `us-central1` em paralelo
(workspace/state separado) e só depois destruir a antiga — troca sem janela de
indisponibilidade. Rejeitada: dobraria o trabalho (dois states, dois conjuntos
de URLs/CORS/secrets simultâneos, nomes de bucket globais teriam de mudar) para
proteger um ambiente de testes que ninguém depende. O mesmo state e o mesmo
`backend.hcl` são reaproveitados: `terraform destroy` esvazia o state,
`terraform apply` com `region` novo o repovoa. O histórico (versioning do
bucket de state) é preservado.

### D2 — Ordem de operações fixa em cinco fases (o runbook é o produto)

A recriação tem dependências de ordem que, ignoradas, produzem exatamente os
dois incidentes já vividos pelo projeto (CORS quebrado —
`corrige-cors-upload-bucket-prod` — e push 401 —
`corrige-finalize-pubsub-status-pending`). A sequência é:

1. **Liberar destruição:** apply pontual com `deletion_protection = false` no
   Cloud SQL (o destroy falha sem isso), depois `terraform destroy`.
2. **Trocar a região no repo e no tfvars** e `apply` — nasce tudo em
   `us-central1`, API com imagem placeholder, `cors_allowed_origins` só com
   `localhost` e `pubsub_push_audience` vazio (as URLs novas ainda não
   existem; ver D3).
3. **Publicar a imagem real:** atualizar `GCP_REGION` no GitHub e rodar o
   `deploy.yml` (o Artifact Registry novo nasce vazio).
4. **Segundo apply de reconciliação:** colher as duas formas de URL do serviço
   novo, preencher `cors_allowed_origins` e `pubsub_push_audience` no tfvars,
   reapontar `var.api_image` para a tag publicada (atualiza os Jobs, que não
   avançam sozinhos por causa do `ignore_changes`) e aplicar.
5. **Bootstrap:** recriar a versão do secret `bootstrap-admin-password` (as
   versões morrem no destroy — o Terraform só gerencia o container) e executar
   o Job `gdoc-prod-bootstrap` (migrações + `global_admin`).

### D3 — Dois applies são inevitáveis (dependência circular URL ↔ tfvars)

`cors_allowed_origins` e `pubsub_push_audience` dependem da URL do Cloud Run,
que só existe depois do primeiro apply. Não há como resolver num apply único
sem adivinhar a URL (a forma `-<nº-projeto>.<região>.run.app` é previsível,
mas a forma `-<hash>-<região abreviada>.a.run.app` não é — e **ambas** precisam
constar no CORS). Aceita-se o apply em duas etapas, que já é o fluxo documentado
no README para o primeiro provisionamento. Deixar a validação OIDC desligada
entre as fases 2 e 4 é seguro: sem imagem real e sem usuários, não há uploads a
reconciliar.

### D4 — Região nova como default no repositório, não só no tfvars

`var.region` tem default `southamerica-east1`; o tfvars real (gitignored) o
sobrescreve. Mudar só o tfvars funcionaria, mas deixaria o repo mentindo sobre
o ambiente real — o mesmo racional do D2 do change do PITR: o repositório
carrega a intenção. Default, `terraform.tfvars.example` e README passam todos a
`us-central1`, e a anotação de latência/gatilho de retorno fica adjacente à
variável em `variables.tf`, onde qualquer troca futura de região vai
obrigatoriamente esbarrar nela.

### D5 — Bucket de state permanece em southamerica-east1

O state são KBs (custo irrelevante), o bucket não é gerenciado por este
Terraform, e movê-lo exigiria recriar bucket + copiar objetos + editar
`backend.hcl` + `terraform init -migrate-state`, com risco de corromper a única
fonte da verdade do ambiente durante a operação mais destrutiva do projeto até
aqui. Sem retorno que justifique. O README passa a anotar que o state fica em
`southamerica-east1` por decisão, para não parecer esquecimento.

### D6 — Invariantes de segurança atravessam a recriação intactos

A recriação não relaxa nada do que as specs já exigem: o bucket novo nasce com
`public_access_prevention = enforced` + uniform bucket-level access (privado
por padrão), URLs assinadas continuam emitidas só após checagem de permissão no
servidor com TTLs distintos (view ~5 min, download ~15–30 min), e o banco novo
recebe as mesmas migrations — incluindo `0002_enable_rls.sql` — via Job de
bootstrap antes de existir qualquer usuário. Nenhuma tabela ou policy muda.
A verificação pós-migração (tasks) inclui confirmar acesso negado a link
direto sem assinatura.

## Risks / Trade-offs

- **[Latência para usuários no Brasil]** ~140–180 ms de RTT adicionais em toda
  requisição e no PUT/GET direto dos bytes no bucket → aceito em fase de
  testes; anotação em `variables.tf` + item fora de escopo criam o gatilho de
  retorno antes de carga real sensível a latência. Voltar depois **com dados**
  é um change de migração de verdade (export/import + rsync + janela).
- **[Esquecer uma das duas formas de URL no CORS]** upload quebra no preflight
  só quando aberto pela forma ausente (falha intermitente, difícil de
  diagnosticar) → o runbook exige as duas formas e a verificação inclui upload
  real pelas duas URLs.
- **[Audience OIDC desatualizado]** push do finalize vira 401 silencioso e
  uploads ficam `pending` → ordem do D2 (imagem com validação sobe antes do
  apply que liga a validação) + verificação de reconciliação de cota no
  runbook; `npm run backfill:pending` cobre resíduos.
- **[Destroy irreversível]** contas/arquivos do ambiente de teste são
  perdidos e a URL antiga divulgada morre → aceito e explícito no proposal;
  o manual do usuário é atualizado com a URL nova.
- **[`deletion_protection` esquecido em `false`]** ambiente novo ficaria sem a
  trava → o runbook restaura `true` na fase 2 (o valor no repo nunca muda; a
  flag só é baixada no tfvars/apply pontual da fase 1).
- **[Drift entre GitHub e Terraform]** `GCP_REGION` é variável manual do
  repositório, fora do state → passo explícito no runbook com conferência dos
  outputs do Terraform lado a lado.

## Migration Plan

O plano operacional detalhado (comandos, ordem, verificações) vive em
`tasks.md` — as fases são as do D2. Rollback: não há rollback parcial; se a
recriação falhar no meio, o caminho é seguir adiante (corrigir e reaplicar) ou,
no limite, repetir o processo de volta para `southamerica-east1` — igualmente
sem dados a perder. O ambiente antigo não é preservado.

## Notas de execução (o que a recriação real revelou)

Executado contra `gdoc-502613` em 2026-07-23. O plano das cinco fases (D2) valeu,
mas a recriação expôs três travas de `deletion_protection`/soft-delete que o D2
só previa para o Cloud SQL. Registradas aqui para o próximo que recriar:

1. **`deletion_protection` implícito no Cloud Run.** Além do Cloud SQL, o
   `google_cloud_run_v2_service` e os dois `google_cloud_run_v2_job` têm
   `deletion_protection` com **default `true` do provider** (não estava no
   `.tf`). O primeiro `destroy` derrubou 60 recursos e falhou nesses três. Fix:
   baixar a flag para `false` nos três (apply direcionado) e repetir o destroy;
   depois **reverter** para o default antes da recriação. Vale anotar a flag
   explicitamente no `.tf` num change futuro para o runbook não ter surpresa.

2. **Pool de Workload Identity Federation é soft-deleted (~30 dias).** O
   `destroy` remove o pool/provider, mas o GCP os retém e o `apply` de
   recriação colide com `409 already exists`. Fix: `gcloud iam
   workload-identity-pools undelete` (pool e provider) + `terraform import` de
   ambos para o state antes de reaplicar. Nomes preservados → variáveis do
   GitHub seguem válidas.

3. **Job de bootstrap exige a versão do secret já no `apply`.** O
   `google_cloud_run_v2_job.bootstrap` referencia
   `bootstrap-admin-password:latest`; com o container recriado vazio, a criação
   do Job falha (`Secret ... was not found`) e o Job fica `tainted`. Fix:
   adicionar uma versão placeholder ao secret **antes** do apply que cria o Job
   (a senha real entra na fase 6, versão que vira `latest` em runtime), e como
   os Jobs têm `ignore_changes` na imagem, apontar `api_image` para a tag real
   exige recriá-los (`gcloud run jobs delete` + `terraform state rm` + `apply`,
   já que o `deletion_protection` do provider barra o destroy pelo Terraform).

**Drift cosmético remanescente:** `terraform plan` acusa 1 mudança perpétua no
`google_cloud_run_v2_service.api` — um bloco `scaling` de nível de serviço que a
API do Cloud Run popula com defaults e o provider não reconcilia (aplicar não
resolve; reaparece no refresh). Não é relacionado à região nem introduzido por
esta migração. Fecha-se, se desejado, com `lifecycle { ignore_changes = [scaling] }`
no serviço — deixado fora daqui por ser mudança de forma de recurso não relacionada.

## Open Questions

- Nenhuma bloqueante. A execução das fases 1–5 exige um ambiente com
  `gcloud`/Terraform autenticados no projeto real (como nos changes de infra
  anteriores) — o sandbox só entrega os artefatos de repo e o runbook.
