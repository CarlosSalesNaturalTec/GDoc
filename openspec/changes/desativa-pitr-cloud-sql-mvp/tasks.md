## 1. Alterar o Terraform (fonte da verdade — design.md D2)

- [ ] 1.1 Em `infra/terraform/cloud_sql.tf`, no bloco `backup_configuration`,
  trocar `point_in_time_recovery_enabled = true` por `false`, **mantendo**
  `enabled = true`.
- [ ] 1.2 Adicionar, junto à flag, comentário de anotação de reativação: medida
  temporária da fase MVP para economia (WAL contínuo em Cloud Storage), reativar
  (voltar a `true`) quando o sistema estiver estável e com carga/uso real; o
  restart e o recomeço da janela de PITR são esperados.
- [ ] 1.3 Atualizar `infra/terraform/README.md` (postura de backup/recuperação):
  backups diários permanecem ligados; PITR desligado na fase MVP com RPO efetivo
  de ~24h; gatilho de reativação.

## 2. Aplicar e reconciliar

- [ ] 2.1 `terraform -chdir=infra/terraform plan` e revisar que a **única**
  mudança é `point_in_time_recovery_enabled: true -> false` na instância
  `gdoc-prod-pg` (update in-place, **sem** recriação da instância e **sem**
  alteração em `enabled`/retenção).
- [ ] 2.2 Escolher janela de baixo uso (o apply reinicia o PostgreSQL — design.md
  D3) e rodar `terraform -chdir=infra/terraform apply`.

## 3. Validar o estado em produção

- [ ] 3.1 Confirmar o estado real:
  `gcloud sql instances describe gdoc-prod-pg --format="value(settings.backupConfiguration.pointInTimeRecoveryEnabled, settings.backupConfiguration.enabled)"`
  → esperado `False   True` (PITR desligado, backups diários ligados).
- [ ] 3.2 Confirmar que o backup diário automático continua agendado
  (`startTime: 03:00`, `retainedBackups: 7`) e que a instância voltou a
  `RUNNABLE` após o restart.

## 4. Governança da reativação (design.md D4)

- [ ] 4.1 Registrar o gatilho de reativação do PITR onde o time acompanha
  pendências de estabilização (ex.: item de backlog/issue), referenciando este
  change — para que "reativar quando estável e com carga real" não se perca.
