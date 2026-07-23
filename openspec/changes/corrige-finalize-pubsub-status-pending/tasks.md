## 1. Tipos compartilhados (`packages/shared`)

- [x] 1.1 Em `packages/shared/src/storage.ts`, modelar o envelope do Pub/Sub push
  (`{ message: { data: string; attributes?: Record<string,string>; messageId?: string } }`)
  e o metadata do GCS (`JSON_API_V1`: ao menos `name`, `size`, `bucket`). Manter
  `StorageFinalizeNotification` (`{ bucket, objectPath, sizeBytes }`) como o
  formato interno já normalizado.
- [x] 1.2 `npm run build --workspace packages/shared` para os consumidores enxergarem.

## 2. Parse do envelope no endpoint

- [x] 2.1 Em `apps/api/src/routes/storage-events.ts`, detectar o formato do corpo:
  se houver `message.data`, decodificar base64 → `JSON.parse` do metadata do GCS →
  normalizar para `{ objectPath: name, sizeBytes: Number(size) }`; senão, usar o
  payload simplificado `{ objectPath, sizeBytes }` (dev/E2E).
- [x] 2.2 Validar o resultado normalizado (objectPath não vazio, sizeBytes finito)
  antes de reconciliar; payload realmente inválido continua `400`.
- [x] 2.3 Trocar o `404` de objeto desconhecido por resposta 2xx (ack), preservando
  a idempotência da reconciliação (reprocessar objeto já `active` não altera nada).

## 3. Autenticação OIDC do push

- [x] 3.1 Adicionar config para a `audience` esperada (derivada do `push_endpoint`
  / URL do Cloud Run) e uma flag para ligar/desligar a validação (ligada em prod,
  desligada em dev — paridade via `config`).
- [x] 3.2 Validar o `Authorization: Bearer <JWT OIDC>` do Pub/Sub: assinatura pelas
  chaves públicas do Google (JWKS, com cache), `aud` esperado e (opcional) o
  `email` da SA `${name_prefix}-pubsub-push`. Fail-closed → `401` sem tocar no
  banco quando a validação estiver ligada.

## 4. Testes

- [x] 4.1 Teste: envelope do Pub/Sub válido reconcilia cota e promove `pending →
  active` (e `replacing → active`), mapeando `name/size` corretamente.
- [x] 4.2 Teste: token OIDC ausente/ inválido/ audience errada → `401`, sem efeito
  no banco (com a validação ligada).
- [x] 4.3 Teste: objeto desconhecido → 2xx (ack), sem alterar cota/status.
- [x] 4.4 Teste: payload simplificado de dev continua funcionando (não regride).

## 5. Backfill dos registros presos

- [x] 5.1 Script/rotina one-shot (`npm run` ou Job pontual) que, para cada arquivo
  em `pending`/`replacing`, consulta o `StoragePort` (existência + tamanho do
  objeto) e aplica a mesma reconciliação (promove a `active`, soma a cota),
  reusando a lógica do handler. Idempotente por status.

## 6. Deploy e validação em produção

> Implementação ligou a validação OIDC via Terraform: definir
> `pubsub_push_audience` em `terraform.tfvars` como `<api_url>/internal/storage-events`
> injeta `PUBSUB_OIDC_VALIDATION=true`, `PUBSUB_PUSH_AUDIENCE` e
> `PUBSUB_PUSH_SA_EMAIL` no Cloud Run. **Ordem obrigatória:** (1) deploy da imagem
> com o fix primeiro; (2) só então `terraform apply` ligando a validação — senão
> pushes válidos viram `401` até o código novo subir. Backfill (`npm run
> backfill:pending`) roda como Job pontual com a mesma imagem/SA/Cloud SQL.

- [ ] 6.1 Merge em `main` → deploy da imagem da API no Cloud Run (CI/CD).
- [ ] 6.2 Confirmar nos logs que `/internal/storage-events` passou a responder
  `2xx` (as mensagens retidas na subscription são reentregues e drenadas).
- [ ] 6.3 Rodar o backfill uma vez para os uploads anteriores ao deploy.
- [ ] 6.4 Validar no SPA de produção: um upload novo sai de `Pending` e vira
  `active`; conferir que o uso de cota da pessoa reflete o arquivo enviado.
