# Reconciliação de cota pós-upload (ver design.md, Decisão 1): o GCS publica
# a finalização do objeto no Pub/Sub, que entrega via push para o endpoint
# interno da API (`POST /internal/storage-events`).

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_pubsub_topic" "storage_finalize" {
  project = var.project_id
  name    = "${local.name_prefix}-storage-finalize"
  labels  = local.labels

  depends_on = [google_project_service.required]
}

# Permite que a identidade de serviço gerenciada do GCS publique neste
# tópico. O e-mail é previsível (convenção do Google), então não depende de
# um provider beta só para lê-lo.
resource "google_pubsub_topic_iam_member" "gcs_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.storage_finalize.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${data.google_project.current.number}@gs-project-accounts.iam.gserviceaccount.com"
}

resource "google_storage_notification" "finalize" {
  bucket         = google_storage_bucket.files.name
  topic          = google_pubsub_topic.storage_finalize.id
  payload_format = "JSON_API_V1"
  event_types    = ["OBJECT_FINALIZE"]

  depends_on = [google_pubsub_topic_iam_member.gcs_publisher]
}

# Identidade dedicada só para autenticar a entrega push do Pub/Sub perante o
# Cloud Run (IAM de privilégio mínimo — não é a mesma conta que a API usa).
resource "google_service_account" "pubsub_push" {
  project      = var.project_id
  account_id   = "${local.name_prefix}-pubsub-push"
  display_name = "Push subscription -> API (storage finalize)"
}

resource "google_cloud_run_v2_service_iam_member" "pubsub_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_push.email}"
}

resource "google_pubsub_subscription" "storage_finalize" {
  project = var.project_id
  name    = "${local.name_prefix}-storage-finalize-push"
  topic   = google_pubsub_topic.storage_finalize.id

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.api.uri}/internal/storage-events"

    oidc_token {
      service_account_email = google_service_account.pubsub_push.email
    }
  }

  ack_deadline_seconds = 30
  retry_policy {
    minimum_backoff = "5s"
    maximum_backoff = "60s"
  }

  labels = local.labels

  depends_on = [google_cloud_run_v2_service_iam_member.pubsub_invoker]
}
