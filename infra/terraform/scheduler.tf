# Cloud Scheduler -> Cloud Run Job (ver design.md, visão de arquitetura:
# expurgo diário da lixeira às 03:00). O job em si é um exemplo/placeholder —
# a lógica real de expurgo é do Épico 6 (lixeira), fora de escopo desta
# fundação; o que esta mudança prova é que o disparo diário funciona
# ponta a ponta.
resource "google_service_account" "trash_purge_job" {
  project      = var.project_id
  account_id   = "${local.name_prefix}-trash-purge"
  display_name = "Trash purge job runtime (${var.environment})"
}

resource "google_cloud_run_v2_job" "trash_purge_example" {
  project  = var.project_id
  name     = "${local.name_prefix}-trash-purge-example"
  location = var.region
  labels   = local.labels

  template {
    template {
      service_account = google_service_account.trash_purge_job.email
      containers {
        image = "us-docker.pkg.dev/cloudrun/container/job"
        resources {
          limits = {
            cpu    = "1"
            # Piso do Cloud Run gen2 com CPU sempre alocada (unthrottled) é
            # 512Mi; abaixo disso a API rejeita a criação do Job.
            memory = "512Mi"
          }
        }
      }
      max_retries = 1
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image]
  }

  depends_on = [google_project_service.required]
}

resource "google_service_account" "scheduler_invoker" {
  project      = var.project_id
  account_id   = "${local.name_prefix}-scheduler"
  display_name = "Cloud Scheduler -> Cloud Run Job invoker (${var.environment})"
}

resource "google_cloud_run_v2_job_iam_member" "scheduler_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.trash_purge_example.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}

resource "google_cloud_scheduler_job" "trash_purge" {
  project   = var.project_id
  region    = var.region
  name      = "${local.name_prefix}-trash-purge"
  schedule  = var.trash_purge_schedule
  time_zone = var.scheduler_time_zone

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.trash_purge_example.name}:run"

    oauth_token {
      service_account_email = google_service_account.scheduler_invoker.email
    }
  }

  retry_config {
    retry_count = 1
  }

  depends_on = [
    google_project_service.required,
    google_cloud_run_v2_job_iam_member.scheduler_invoker,
  ]
}
