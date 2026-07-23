## ADDED Requirements

### Requirement: Postura de backup e recuperação do Cloud SQL de produção

A instância de produção do Cloud SQL SHALL manter **backups automáticos diários
habilitados e retidos** (`backup_configuration.enabled = true`, com retenção de
pelo menos os últimos dias configurados) como durabilidade mínima — backups
NUNCA SHALL ser desligados enquanto a instância operar em produção.

O **Point-in-Time Recovery (PITR)** MAY estar desligado na fase MVP/baixo uso
para economizar o custo do arquivamento contínuo de transaction logs (WAL); nesse
estado o RPO efetivo é o último backup diário (~24h). O PITR SHALL ser reativado
antes de a instância operar com carga/dados de produção que exijam recuperação de
ponto-no-tempo (RPO curto).

O estado do PITR SHALL ser configurado no Terraform (fonte da verdade), nunca por
alteração manual no console/`gcloud` que geraria drift; quando desligado, a
configuração SHALL registrar, por anotação adjacente, que é temporário e o
gatilho de reativação.

#### Scenario: Backups diários permanecem ligados com o PITR desligado

- **WHEN** o PITR está desligado na fase MVP
- **THEN** os backups automáticos diários da instância permanecem habilitados e
  retidos, de modo que ainda é possível restaurar a instância para o estado de um
  dos backups diários mais recentes.

#### Scenario: Estado do PITR reflete o Terraform, sem drift

- **WHEN** o Terraform declara `point_in_time_recovery_enabled = false` (com a
  anotação de reativação) e é aplicado
- **THEN** o estado real da instância em produção reflete o valor declarado, e um
  `terraform plan` subsequente não acusa diferença nessa flag.

#### Scenario: Reativação restabelece a recuperação de ponto-no-tempo

- **WHEN** o sistema atinge o gatilho de reativação (estável, com carga/uso real)
  e o Terraform passa `point_in_time_recovery_enabled` de volta para `true` e é
  aplicado
- **THEN** o PITR volta a ficar ativo na instância e a janela de recuperação de
  ponto-no-tempo passa a acumular a partir da reativação.
