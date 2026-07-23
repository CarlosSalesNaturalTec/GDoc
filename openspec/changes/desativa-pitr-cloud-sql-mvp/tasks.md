## 1. Alterar o Terraform (fonte da verdade — design.md D2)

- [x] 1.1 Em `infra/terraform/cloud_sql.tf`, no bloco `backup_configuration`,
  trocar `point_in_time_recovery_enabled = true` por `false`, **mantendo**
  `enabled = true`.
- [x] 1.2 Adicionar, junto à flag, comentário de anotação de reativação: medida
  temporária da fase MVP para economia (WAL contínuo em Cloud Storage), reativar
  (voltar a `true`) quando o sistema estiver estável e com carga/uso real; o
  restart e o recomeço da janela de PITR são esperados.
- [x] 1.3 Atualizar `infra/terraform/README.md` (postura de backup/recuperação):
  backups diários permanecem ligados; PITR desligado na fase MVP com RPO efetivo
  de ~24h; gatilho de reativação.

## 2. Aplicar e reconciliar

- [x] 2.1 `terraform -chdir=infra/terraform plan` e revisar que a **única**
  mudança é `point_in_time_recovery_enabled: true -> false` na instância
  `gdoc-prod-pg` (update in-place, **sem** recriação da instância e **sem**
  alteração em `enabled`/retenção). (Plano também mostrou drift benigno,
  pré-existente e não relacionado em `google_cloud_run_v2_service.api`
  — `client`/`client_version`/`scaling` computados, repopulados pelo próximo
  `gcloud run deploy` do CI/CD; decisão do usuário foi aplicar junto.)
- [x] 2.2 Escolher janela de baixo uso (o apply reinicia o PostgreSQL — design.md
  D3) e rodar `terraform -chdir=infra/terraform apply`. Aplicado: `google_sql_database_instance.main`
  modificado in-place (~3m18s, restart esperado), `google_cloud_run_v2_service.api`
  atualizado (~2s, sem downtime). `Apply complete! Resources: 0 added, 2 changed, 0 destroyed.`

## 3. Validar o estado em produção

- [x] 3.1 Confirmar o estado real:
  `gcloud sql instances describe gdoc-prod-pg --format="value(settings.backupConfiguration.pointInTimeRecoveryEnabled, settings.backupConfiguration.enabled)"`
  → esperado `False   True` (PITR desligado, backups diários ligados). Confirmado: `False	True`.
- [x] 3.2 Confirmar que o backup diário automático continua agendado
  (`startTime: 03:00`, `retainedBackups: 7`) e que a instância voltou a
  `RUNNABLE` após o restart. Confirmado: `RUNNABLE  03:00  7`.

## 4. Governança da reativação (design.md D4)

- [x] 4.1 Registrar o gatilho de reativação do PITR onde o time acompanha
  pendências de estabilização (ex.: item de backlog/issue), referenciando este
  change — para que "reativar quando estável e com carga real" não se perca.
  Decisão do usuário: a anotação em `cloud_sql.tf` + a seção nova em
  `infra/terraform/README.md` já são o registro suficiente (sem issue
  separada).
