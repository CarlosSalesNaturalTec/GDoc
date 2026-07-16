# Bucket de arquivos — 100% privado (ver design.md, Decisão 1: "o bucket
# nunca é público" é o que sustenta o bloqueio de link direto). Nenhum
# binding de IAM público é concedido em nenhum lugar deste arquivo.
resource "google_storage_bucket" "files" {
  project                     = var.project_id
  name                        = "${var.project_id}-${local.name_prefix}-files"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  cors {
    origin          = var.cors_allowed_origins
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["Content-Type", "Content-Disposition"]
    max_age_seconds = 3600
  }

  # Isolamento por unidade é imposto no Postgres (RLS) e na checagem de
  # permissão antes de emitir a URL assinada — o prefixo `/{unit_id}/...`
  # dentro deste bucket único é uma camada extra, não o controle primário
  # (ver design.md, Decisão 2). Um bucket por unidade provisionaria N
  # buckets a cada unidade nova, sem ganho real de segurança.

  labels = local.labels

  depends_on = [google_project_service.required]
}
