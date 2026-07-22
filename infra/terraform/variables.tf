variable "project_id" {
  description = "ID do projeto GCP onde a fundação de produção é provisionada."
  type        = string
}

variable "region" {
  description = "Região GCP para os recursos regionais (Cloud Run, Cloud SQL, Artifact Registry)."
  type        = string
  default     = "southamerica-east1"
}

variable "environment" {
  description = "Nome do ambiente, usado como sufixo de nomes de recursos. Só 'prod' está em escopo nesta mudança (staging fica para o futuro)."
  type        = string
  default     = "prod"
}

variable "app_name" {
  description = "Prefixo de nome usado em todos os recursos deste app."
  type        = string
  default     = "gdoc"
}

variable "db_tier" {
  description = "Tier de máquina do Cloud SQL. Padrão é o menor disponível (MVP, baixo custo) — revisar para carga real de produção."
  type        = string
  default     = "db-f1-micro"
}

variable "db_name" {
  description = "Nome do banco de dados da aplicação no Cloud SQL."
  type        = string
  default     = "gdoc"
}

variable "db_user" {
  description = "Usuário Postgres da aplicação (dono das tabelas; RLS usa FORCE ROW LEVEL SECURITY para restringi-lo mesmo assim)."
  type        = string
  default     = "gdoc_app"
}

variable "api_image" {
  description = <<-EOT
    Imagem de container do Cloud Run para a API. Antes do primeiro deploy via
    CI/CD (seção 7 do tasks.md), usa a imagem de exemplo pública do Cloud Run
    só para o serviço existir; o Terraform ignora mudanças nesse campo depois
    (o CI/CD passa a ser dono da imagem publicada).
  EOT
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "api_cpu" {
  description = "CPU alocada ao container da API no Cloud Run."
  type        = string
  default     = "1"
}

variable "api_memory" {
  description = "Memória alocada ao container da API no Cloud Run."
  type        = string
  default     = "512Mi"
}

variable "api_min_instances" {
  description = "Instâncias mínimas do Cloud Run da API (0 = escala a zero; MVP de baixo custo)."
  type        = number
  default     = 0
}

variable "api_max_instances" {
  description = "Teto de instâncias do Cloud Run da API."
  type        = number
  default     = 3
}

variable "cors_allowed_origins" {
  description = "Origens (browser) autorizadas a fazer upload/download direto no bucket de arquivos via CORS. Inclui o dev server do Vite por padrão; adicionar o domínio real do SPA em prod."
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "frontend_domain" {
  description = <<-EOT
    Domínio customizado do SPA (ex.: app.gdoc.exemplo.com.br). Vazio (padrão)
    significa "sem domínio ainda": o bucket do frontend e o Cloud CDN são
    criados, mas o balanceador de carga + certificado gerenciado (que exigem
    um domínio real para o Google emitir o certificado) ficam de fora até um
    domínio ser definido.
  EOT
  type        = string
  default     = ""
}

variable "signed_url_view_ttl_seconds" {
  description = "TTL da URL assinada de visualização. Ver design.md, Decisão 1."
  type        = number
  default     = 300
}

variable "signed_url_download_ttl_seconds" {
  description = "TTL da URL assinada de download/upload. Ver design.md, Decisão 1."
  type        = number
  default     = 1800
}

variable "storage_quota_bytes_per_user" {
  description = "Cota de armazenamento por usuário, em bytes."
  type        = number
  default     = 10737418240 # 10 GiB
}

variable "trash_purge_schedule" {
  description = "Expressão cron (fuso do Cloud Scheduler) do expurgo diário da lixeira. Ver design.md: 03:00."
  type        = string
  default     = "0 3 * * *"
}

variable "trash_retention_days" {
  description = "Dias de retenção da lixeira antes do expurgo permanente (Épico 6, change epico-6-lixeira-retencao, design.md D6/D7)."
  type        = number
  default     = 30
}

variable "scheduler_time_zone" {
  description = "Fuso horário usado pelo Cloud Scheduler."
  type        = string
  default     = "America/Sao_Paulo"
}

variable "bootstrap_admin_email" {
  description = <<-EOT
    E-mail do administrador global criado pelo Job de bootstrap
    (name_prefix-bootstrap). A senha correspondente vem do secret
    bootstrap-admin-password (ver secret_manager.tf), nunca de uma variável do
    Terraform. Ver openspec/changes/bootstrap-admin-producao/design.md D3/D7.
  EOT
  type        = string
}

variable "bootstrap_admin_unit" {
  description = "Nome da unidade do administrador global de bootstrap."
  type        = string
  default     = "Administração"
}

variable "labels" {
  description = "Labels aplicadas a todos os recursos que suportam labels."
  type        = map(string)
  default     = {}
}

variable "github_repository" {
  description = <<-EOT
    Repositório GitHub ("owner/repo") autorizado a assumir a service account
    de deploy do CI/CD via Workload Identity Federation — sem chave exportada
    (ver cicd.tf). Só esse repositório específico pode se passar pela SA.
  EOT
  type        = string
  default     = "CarlosSalesNaturalTec/GDoc"
}
