## Contexto

Bug de produção: upload direto ao bucket GCS bloqueado por CORS. O diagnóstico
completo está no `proposal.md`. Este documento registra apenas as decisões de
design do recorte mínimo.

## Decisões

### D1 — Corrigir CORS no bucket, não no código de aplicação

O `put-object.ts` faz um `PUT` cross-origin com `Content-Type`, que **sempre**
dispara preflight `OPTIONS` — não há como evitar o preflight mantendo o
invariante "bytes nunca passam pela API" (CLAUDE.md, "Tráfego de bytes"). Logo, a
correção é autorizar a origem do SPA no CORS do bucket, e não mexer no fluxo de
upload. O código já está correto.

### D2 — Listar explicitamente as duas URLs do Cloud Run

O Cloud Run expõe duas formas de URL estáveis para o mesmo serviço, e o usuário
pode acessar por qualquer uma:

```
https://gdoc-prod-api-hmwigy67mq-rj.a.run.app              (forma -hash-<região>.a.run.app)
https://gdoc-prod-api-434553790439.southamerica-east1.run.app  (forma -<nº-projeto>.<região>.run.app)
```

O `Origin` enviado no PUT é aquele por onde o SPA foi aberto; se só uma constar
no CORS, o bug reaparece na outra. Portanto **ambas** vão para
`cors_allowed_origins`.

Não derivamos o valor de `google_cloud_run_v2_service.api.uri` (o `output
api_url`) porque esse atributo devolve **apenas uma** das duas formas (a baseada
no número do projeto); a forma `-hash-...a.run.app` não é exposta por nenhum
atributo do Terraform. Derivar cobriria só metade dos acessos — pior que fixar as
duas explicitamente.

### D3 — Onde fixar o valor

O valor real vai em `infra/terraform/terraform.tfvars` (gitignored). O default em
`variables.tf` (`["http://localhost:5173"]`) permanece só como conveniência de
dev; o `terraform.tfvars.example` e o `README.md` passam a instruir explicitamente
a incluir a(s) URL(s) do Cloud Run em produção. Assim o repositório não carrega
uma URL específica de ambiente no default versionado.

### D4 — Hotfix operacional antes do apply

Como é um bug de produção ativo, o CORS pode ser aplicado imediatamente ao bucket
com `gcloud storage buckets update <bucket> --cors-file=cors.json`, sem esperar o
ciclo de `terraform apply` (que recria a revisão do Cloud Run). O `terraform
apply` subsequente reconcilia e passa a ser a fonte da verdade — sem ele, o
próximo apply reverteria o CORS para o default de dev.

## Fora de escopo

- Registros órfãos `status='pending'` das tentativas falhas (limpeza + robustez
  no fluxo de erro do `put-object`) — change próprio.
- Domínio custom (`frontend_domain` + LB/certificado) que daria uma origem única
  e estável, eliminando o caso das "duas URLs".
