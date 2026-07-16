# Cloud SQL (Postgres) — metadados, permissões, auditoria e cotas (ver
# design.md, Decisão 2: RLS por unit_id roda igual aqui e no Postgres local
# do sandbox).
#
# Decisão de rede: IP público, mas SEM `authorized_networks` — nenhuma faixa
# de IP é autorizada a conectar diretamente. A API se conecta via integração
# nativa do Cloud Run com o Cloud SQL (Cloud SQL Auth Proxy gerenciado, ver
# `cloud_run.tf`), que autentica por IAM e nunca depende de uma rota de rede
# liberada. Isso evita o custo/complexidade de um conector Serverless VPC
# Access ou de private service access só para o MVP — mesmo nível de
# segurança prática, footprint menor. Reavaliar se um requisito futuro exigir
# IP privado (ex.: peering com rede on-prem).
resource "google_sql_database_instance" "main" {
  project             = var.project_id
  name                = "${local.name_prefix}-pg"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true

  settings {
    tier = var.db_tier

    ip_configuration {
      ipv4_enabled = true
      # Nenhum authorized_networks: só a integração Cloud Run ↔ Cloud SQL
      # (autenticada por IAM) alcança a instância.
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
    }

    availability_type = "ZONAL"

    user_labels = local.labels
  }

  depends_on = [google_project_service.required]
}

resource "google_sql_database" "app" {
  project  = var.project_id
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

resource "random_password" "db_user" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  project  = var.project_id
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = random_password.db_user.result
}
