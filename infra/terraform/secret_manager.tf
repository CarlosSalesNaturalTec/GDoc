# Segredos injetados no Cloud Run como variáveis de ambiente nativas do
# Secret Manager (ver design.md: "Segredos e configuração" — SecretsPort
# abstrai a origem, mas em prod a variável de ambiente já chega resolvida).

resource "random_password" "auth_session_secret" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "database_url" {
  project   = var.project_id
  secret_id = "${local.name_prefix}-database-url"
  labels    = local.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id
  # Conexão via socket Unix do Cloud SQL, montado pela integração nativa do
  # Cloud Run (ver cloud_run.tf) — mesma lib `pg`, sem código condicional por
  # ambiente além da própria connection string.
  secret_data = "postgres://${google_sql_user.app.name}:${random_password.db_user.result}@/${google_sql_database.app.name}?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
}

resource "google_secret_manager_secret" "auth_session_secret" {
  project   = var.project_id
  secret_id = "${local.name_prefix}-auth-session-secret"
  labels    = local.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "auth_session_secret" {
  secret      = google_secret_manager_secret.auth_session_secret.id
  secret_data = random_password.auth_session_secret.result
}
