terraform {
  required_version = ">= 1.7.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Estado remoto em GCS — configuração parcial de propósito: o nome do bucket
  # de estado é per-ambiente/operador, não um valor de código. Ver README.md
  # ("Bootstrap") para criar o bucket e aplicar com `-backend-config=backend.hcl`.
  backend "gcs" {}
}
