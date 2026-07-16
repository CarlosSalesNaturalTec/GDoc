# Habilita as APIs GCP necessárias antes de qualquer outro recurso depender
# delas. `disable_on_destroy = false` evita que um `destroy` acidental do
# ambiente desabilite APIs de outros projetos/serviços que dependam delas.
resource "google_project_service" "required" {
  for_each = toset(local.required_apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
