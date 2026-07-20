# Bucket + CDN para o SPA (frontend estático — ver design.md, visão de
# arquitetura). Diferente do bucket de arquivos: este serve assets públicos
# (JS/CSS/HTML da aplicação), então leitura pública é o comportamento
# esperado, não um risco — nenhum dado de usuário mora aqui.
#
# `apps/web` ainda é só o layout reservado (sem build da SPA) — este bucket
# fica provisionado e vazio até a mudança que implementa o frontend publicar
# o `dist/` aqui.
resource "google_storage_bucket" "frontend" {
  project                     = var.project_id
  name                        = "${var.project_id}-${local.name_prefix}-web"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html" # SPA: roteamento client-side
  }

  labels = local.labels

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket_iam_member" "frontend_public_read" {
  bucket = google_storage_bucket.frontend.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_compute_backend_bucket" "frontend" {
  project     = var.project_id
  name        = "${local.name_prefix}-web-backend"
  bucket_name = google_storage_bucket.frontend.name
  enable_cdn  = true

  depends_on = [google_project_service.required]
}

# Serverless NEG + backend service apontando para a API (Cloud Run) — permite
# ao load balancer da SPA rotear os prefixos de API para o mesmo serviço já
# provisionado em cloud_run.tf, sem expor um endpoint/IP separado (design.md
# D1 do change `web-shell-e-auth`: SPA e API na mesma origem, para que o
# cookie de sessão HttpOnly/SameSite=Strict funcione sem CORS).
resource "google_compute_region_network_endpoint_group" "api" {
  project               = var.project_id
  name                  = "${local.name_prefix}-api-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

resource "google_compute_backend_service" "api" {
  project = var.project_id
  name    = "${local.name_prefix}-api-backend"

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }

  log_config {
    enable = true
  }

  depends_on = [google_project_service.required]
}

resource "google_compute_url_map" "frontend" {
  project         = var.project_id
  name            = "${local.name_prefix}-web-urlmap"
  default_service = google_compute_backend_bucket.frontend.id

  # Mesma origem para SPA + API: os prefixos de `local.api_proxy_prefixes`
  # (espelhados em apps/web/vite.config.ts) vão para a Cloud Run; qualquer
  # outro caminho continua servido pelo bucket+CDN da SPA.
  host_rule {
    hosts        = ["*"]
    path_matcher = "api-routing"
  }

  path_matcher {
    name            = "api-routing"
    default_service = google_compute_backend_bucket.frontend.id

    dynamic "path_rule" {
      for_each = local.api_proxy_prefixes
      content {
        paths   = [path_rule.value, "${path_rule.value}/*"]
        service = google_compute_backend_service.api.id
      }
    }
  }
}

# Recursos de domínio/TLS/LB só são criados quando `frontend_domain` é
# definido — o Google só emite o certificado gerenciado para um domínio real
# (ver variables.tf). Sem domínio, o bucket acima já serve para inspecionar
# o build diretamente via `gsutil`/console, o que basta antes de o frontend
# existir.
resource "google_compute_managed_ssl_certificate" "frontend" {
  count   = local.create_frontend_lb ? 1 : 0
  project = var.project_id
  name    = "${local.name_prefix}-web-cert"

  managed {
    domains = [var.frontend_domain]
  }
}

resource "google_compute_target_https_proxy" "frontend" {
  count            = local.create_frontend_lb ? 1 : 0
  project          = var.project_id
  name             = "${local.name_prefix}-web-https-proxy"
  url_map          = google_compute_url_map.frontend.id
  ssl_certificates = [google_compute_managed_ssl_certificate.frontend[0].id]
}

resource "google_compute_global_address" "frontend" {
  count   = local.create_frontend_lb ? 1 : 0
  project = var.project_id
  name    = "${local.name_prefix}-web-ip"
}

resource "google_compute_global_forwarding_rule" "frontend_https" {
  count                 = local.create_frontend_lb ? 1 : 0
  project               = var.project_id
  name                  = "${local.name_prefix}-web-https-fr"
  target                = google_compute_target_https_proxy.frontend[0].id
  ip_address            = google_compute_global_address.frontend[0].address
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# Redireciona HTTP -> HTTPS em vez de servir conteúdo em texto claro.
resource "google_compute_url_map" "frontend_http_redirect" {
  count   = local.create_frontend_lb ? 1 : 0
  project = var.project_id
  name    = "${local.name_prefix}-web-http-redirect"

  default_url_redirect {
    https_redirect = true
    strip_query    = false
  }
}

resource "google_compute_target_http_proxy" "frontend" {
  count   = local.create_frontend_lb ? 1 : 0
  project = var.project_id
  name    = "${local.name_prefix}-web-http-proxy"
  url_map = google_compute_url_map.frontend_http_redirect[0].id
}

resource "google_compute_global_forwarding_rule" "frontend_http" {
  count                 = local.create_frontend_lb ? 1 : 0
  project               = var.project_id
  name                  = "${local.name_prefix}-web-http-fr"
  target                = google_compute_target_http_proxy.frontend[0].id
  ip_address            = google_compute_global_address.frontend[0].address
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
