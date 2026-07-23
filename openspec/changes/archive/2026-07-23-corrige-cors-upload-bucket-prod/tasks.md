## 1. Descobrir os valores do ambiente

- [x] 1.1 Obter o nome do bucket de arquivos:
  `terraform -chdir=infra/terraform output -raw files_bucket_name`.
  → `gdoc-502613-gdoc-prod-files`.
- [x] 1.2 Confirmar as origens de produção do SPA — as URL(s) do serviço Cloud Run
  da API (as duas formas, `-hash-<região>.a.run.app` e
  `-<nº-projeto>.<região>.run.app`). Podem ser lidas no console do erro
  ("Origin '...' has been blocked") ou no Console do Cloud Run.

## 2. Hotfix operacional (destrava produção sem esperar o apply — design.md D4)

- [x] 2.1 Criar um `cors.json` com as origens de prod e os métodos `GET`, `PUT`,
  `HEAD` (espelhando `storage.tf`), por exemplo:
  ```json
  [{"origin":["https://gdoc-prod-api-hmwigy67mq-rj.a.run.app",
              "https://gdoc-prod-api-434553790439.southamerica-east1.run.app"],
    "method":["GET","PUT","HEAD"],
    "responseHeader":["Content-Type","Content-Disposition"],
    "maxAgeSeconds":3600}]
  ```
- [x] 2.2 Aplicar ao bucket:
  `gcloud storage buckets update gs://<files_bucket_name> --cors-file=cors.json`.
  → hotfix já aplicado; bucket continha as duas URLs de prod antes do apply.
- [x] 2.3 Validar no navegador: reenviar um arquivo pelo SPA de produção e
  confirmar que o `PUT` conclui (item vai a 100%, mensagem "enviado"), sem erro de
  CORS no console. → validado pelo usuário: upload de teste concluído com sucesso.

## 3. Fixar em Terraform (fonte da verdade — design.md D2/D3)

- [x] 3.1 Em `infra/terraform/terraform.tfvars` (gitignored), definir
  `cors_allowed_origins` com `http://localhost:5173` **e** as duas URLs de
  produção do Cloud Run.
- [x] 3.2 Atualizar `infra/terraform/terraform.tfvars.example` para descrever que
  a origem de prod é a(s) URL(s) do Cloud Run da API (mesma origem que serve a
  SPA) e que ambas as formas devem constar enquanto não houver domínio custom.
- [x] 3.3 Atualizar `infra/terraform/README.md` na seção de storage/CORS com a
  mesma orientação e a menção ao hotfix via `gcloud`.
- [x] 3.4 (Opcional) Revisar se o default de `cors_allowed_origins` em
  `variables.tf` deve permanecer só com o dev server — mantê-lo evita versionar
  URL de ambiente específico no default (design.md D3). Decisão: mantido só com
  `http://localhost:5173`; a `description` da variável foi expandida para orientar
  a definir a(s) URL(s) do Cloud Run em `terraform.tfvars` em produção.

## 4. Aplicar e reconciliar

- [x] 4.1 `terraform -chdir=infra/terraform plan` e revisar que a única mudança de
  CORS é a adição das origens (sem recriação do bucket).
  → plan: `0 to add, 2 to change, 0 to destroy`; bucket update in-place adicionando
  `http://localhost:5173` (Cloud Run reconciliado de drift do último deploy).
- [x] 4.2 `terraform -chdir=infra/terraform apply`.
  → aplicado; CORS final com as 3 origens, Terraform como fonte da verdade.
- [x] 4.3 Reconfirmar o upload direto no SPA de produção após o apply (mesma
  verificação da task 2.3), garantindo que o Terraform manteve o CORS correto.
  → validado pelo usuário: upload de teste concluído com sucesso após o apply.
