## Contexto

Medida de economia de custo na fase MVP: desligar o PITR do Cloud SQL de
produção, mantendo os backups diários. O diagnóstico do estado atual e a
motivação estão no `proposal.md`. Este documento registra as decisões de design
e os trade-offs aceitos.

## Decisões

### D1 — Desligar só o PITR; manter os backups diários ligados

`backup_configuration.enabled` e `point_in_time_recovery_enabled` são
independentes e cobrem RPOs diferentes:

- **Backups diários** (`enabled = true`, `retainedBackups = 7`): permitem
  restaurar para o estado de um dos snapshots das últimas 7 madrugadas (~03:00).
  RPO na ordem de **24h**.
- **PITR** (`point_in_time_recovery_enabled`): além dos backups, arquiva WAL
  continuamente e permite restaurar para **qualquer instante** dentro da janela
  (`transactionLogRetentionDays`). RPO próximo de **zero**. É o WAL contínuo em
  Cloud Storage que gera o custo que queremos cortar.

Mantemos os backups diários ligados (durabilidade mínima preservada) e
desligamos apenas o PITR. Não desligamos backups — isso deixaria a instância sem
rede de segurança alguma, o que não é aceitável nem na fase MVP.

### D2 — Fixar o estado no Terraform, com anotação de reativação

A instância tem label `managed_by = terraform`. Alternar a flag pelo console/
`gcloud` criaria **drift** e o próximo `terraform apply` restauraria `true`.
Portanto a mudança é feita em `infra/terraform/cloud_sql.tf`, e o comentário
adjacente à flag deixa explícito: (a) que é temporário, da fase MVP; (b) o
gatilho de reativação ("sistema estável e com carga/uso real"); (c) que reativar
é voltar para `true`. Assim o repositório carrega a intenção, não só o valor.

### D3 — Restart do PostgreSQL é esperado e aceito

No PostgreSQL, alternar `point_in_time_recovery_enabled` **reinicia a
instância** (breve indisponibilidade). É inerente à operação; mitigação é
aplicar em janela de baixo uso. Não há como evitar o restart mantendo a mudança.

### D4 — Perda imediata da janela de PITR ao desligar (aceito)

Ao desligar, os transaction logs arquivados são descartados e a capacidade de
PITR desaparece na hora. Durante o período desligado, o **RPO efetivo degrada
para ~24h** (último backup diário). Esse é o risco explicitamente aceito em
troca da economia, **válido só enquanto não há dados de produção com exigência
de recuperação de ponto-no-tempo**. Por isso a reativação é parte da mudança
(governança), não um "talvez futuro".

## Trade-off aceito

| Aspecto | Com PITR (antes) | Sem PITR (esta fase) |
|---|---|---|
| RPO | ~0 (qualquer instante, 7 dias) | ~24h (último backup diário) |
| Recuperação de delete lógico | até segundos antes | só até a madrugada anterior |
| Custo de storage de WAL | contínuo | zero |
| Reversível | — | sim (restart + acúmulo recomeça) |

## Fora de escopo

- Revisão do tier `db-f1-micro` para carga real de produção.
- Alta disponibilidade (`availability_type = REGIONAL`).
- Definição formal de RPO/RTO de produção, alertas de backup e o processo que
  dispara a reativação do PITR — fase de estabilização.
