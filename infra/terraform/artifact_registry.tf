resource "google_artifact_registry_repository" "api" {
  project       = var.project_id
  location      = var.region
  repository_id = "${local.name_prefix}-api"
  format        = "DOCKER"
  description   = "Imagens da API do GDoc (${var.environment})."
  labels        = local.labels

  depends_on = [google_project_service.required]
}
