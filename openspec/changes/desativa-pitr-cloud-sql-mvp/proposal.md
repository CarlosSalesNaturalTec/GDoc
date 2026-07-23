## Why

A instância de produção do Cloud SQL (`gdoc-prod-pg`, Postgres 16, tier
`db-f1-micro`, `availability_type = ZONAL`) está com **Point-in-Time Recovery
(PITR) ligado** (`point_in_time_recovery_enabled = true`,
`infra/terraform/cloud_sql.tf`). Estado real conferido em produção:

- `backupConfiguration.enabled = true`, backup diário às `03:00`,
  `retainedBackups = 7`.
- `pointInTimeRecoveryEnabled = true`, `transactionLogRetentionDays = 7`,
  `transactionalLogStorageState = CLOUD_STORAGE`.

O PITR mantém o **arquivamento contínuo de transaction logs (WAL) no Cloud
Storage**, que tem custo de armazenamento proporcional ao volume de escrita e à
janela de retenção. Na fase atual — MVP, sem carga real e sem dados de produção
com exigência de RPO curto — esse custo não se justifica: os **backups diários
automáticos** já cobrem o cenário de recuperação aceitável para o estágio.

Queremos **desligar o PITR temporariamente** para reduzir custo, **mantendo os
backups diários habilitados**, e deixar registrado de forma explícita (no
Terraform, fonte da verdade) que o PITR **deve ser reativado** quando o sistema
estiver estável e com carga/uso real.

## What Changes

- Em `infra/terraform/cloud_sql.tf`, alterar
  `point_in_time_recovery_enabled` de `true` para `false`, **mantendo**
  `backup_configuration.enabled = true` (backups diários e retenção
  inalterados).
- Registrar, junto à flag, uma **anotação de reativação** (comentário no
  Terraform) deixando claro que é uma medida temporária da fase MVP e que o PITR
  deve voltar a `true` antes de carga de produção real.
- Documentar a decisão e o gatilho de reativação em `infra/terraform/README.md`
  (postura de backup/recuperação).

## Capabilities

### New Capabilities
<!-- Nenhuma capability nova. -->

### Modified Capabilities
- `platform-infrastructure`: passa a especificar a **postura de backup e
  recuperação do Cloud SQL de produção** — backups automáticos diários
  habilitados e retidos SHALL permanecer sempre ligados; o PITR pode estar
  desligado na fase MVP para economia (RPO efetivo degrada para o último backup
  diário), e SHALL ser reativado antes de operar com carga/dados de produção que
  exijam RPO curto. O estado do PITR SHALL ser configurado no Terraform (fonte
  da verdade), com anotação de reativação quando desligado.

## Impact

- Infra: `infra/terraform/cloud_sql.tf` (flag + comentário de reativação) e
  `infra/terraform/README.md` (documentação da postura de backup).
- Sem alteração de código de aplicação (`apps/*`), de migrations ou de schema.
- **Efeito operacional ao aplicar:**
  - O PostgreSQL **reinicia** ao alternar `point_in_time_recovery_enabled` →
    breve indisponibilidade (segundos a poucos minutos). Aplicar em janela de
    baixo uso.
  - Ao desligar, os transaction logs (WAL) existentes são **descartados**: a
    janela de PITR anterior deixa de existir imediatamente. A partir daí o
    melhor ponto de recuperação passa a ser o **último backup diário**
    (granularidade de ~24h), não "qualquer instante".
  - **Reversível:** reativar é voltar a flag para `true` (novo restart); a
    janela de PITR passa a acumular a partir da reativação.
- Fora de escopo:
  - Revisão do tier `db-f1-micro` para carga real (change próprio; já sinalizado
    em `infra/terraform/README.md`).
  - Alta disponibilidade (`availability_type = REGIONAL`) — ZONAL permanece.
  - Alertas/monitoração de sucesso de backup e definição formal de RPO/RTO de
    produção — ficam para a fase de estabilização, junto do gatilho de
    reativação do PITR.
