## Why

Em produção, todo arquivo enviado (US 3.1/3.2) fica preso em `status='pending'`
para sempre, mesmo com os bytes já no bucket e visualização/download
funcionando. A causa: o endpoint de reconciliação `POST /internal/storage-events`
(`apps/api/src/routes/storage-events.ts`) só entende o payload **simplificado** de
dev (`{ objectPath, sizeBytes }`), mas o Pub/Sub push de produção entrega o
**envelope real** (`{ message: { data: <base64>, attributes } }`) com o metadata
do GCS no formato `JSON_API_V1` (`name`, `size`, `bucket`). O endpoint lê
`req.body.objectPath` → `undefined` → responde **400** → o Pub/Sub re-tenta em
backoff e desiste → o `UPDATE files SET status='active'` nunca roda. Confirmado
nos logs do Cloud Run: sequência contínua de `400` em `/internal/storage-events`.

O caminho de produção (GCS → Pub/Sub → endpoint) nunca foi exercido de ponta a
ponta — só o atalho de dev (chamada direta com o payload simplificado). Sem o
finalize, além do status travado, a **cota por pessoa não é reconciliada** (o uso
real nunca é somado).

## What Changes

- `POST /internal/storage-events` passa a aceitar o **envelope do Pub/Sub push**:
  extrai `message.data`, decodifica base64, faz parse do metadata do GCS
  (`JSON_API_V1`) e mapeia `name → objectPath` e `size → sizeBytes`. Mantém
  compatibilidade com o payload simplificado de dev (detecta o formato).
- O endpoint passa a **autenticar** a entrega push validando o **token OIDC** do
  Pub/Sub (assinatura Google + `audience`), fechando o gap de segurança já
  registrado no `infra/terraform/README.md` (hoje o endpoint é efetivamente
  aberto porque o Cloud Run concede `allUsers:run.invoker`).
- Semântica de resposta compatível com a retentativa do Pub/Sub: notificação de
  objeto **desconhecido** (não corresponde a nenhum registro) passa a ser
  **reconhecida** (2xx), não `404`, para não gerar retentativa infinita.
  Payload realmente inválido continua `400`.
- **Backfill único** dos registros já presos em `pending`/`replacing`: reconciliar
  contra os objetos existentes no bucket, promovendo-os a `active` e ajustando a
  cota, para os uploads já feitos não ficarem órfãos.

## Capabilities

### New Capabilities
<!-- Nenhuma capability nova. -->

### Modified Capabilities
- `platform-infrastructure`: o requisito de reconciliação de cota pós-upload passa
  a exigir explicitamente que o endpoint de finalização **aceite o transporte de
  produção** (envelope do Pub/Sub push com o metadata do GCS) e **autentique** a
  notificação (OIDC), e que um objeto finalizado no storage torne o arquivo
  `active`/consultável — não apenas o formato de teste de dev.

## Impact

- Código: `apps/api/src/routes/storage-events.ts` (parse de envelope + OIDC +
  semântica de resposta); `packages/shared/src/storage.ts`
  (`StorageFinalizeNotification` e/ou tipos do envelope). Sem mudança no fluxo de
  emissão de URL nem no `put-object.ts`.
- Dados: script/rotina de backfill dos `pending`/`replacing` existentes (one-shot).
- Infra: nenhuma mudança de recursos — `pubsub.tf` já provisiona tópico,
  `google_storage_notification` e a subscription push com OIDC. A `audience`
  esperada na validação é a URL do serviço Cloud Run (mesmo `oidc_token`).
- Testes: cobrir o parse do envelope do Pub/Sub, a rejeição de token OIDC
  inválido, o mapeamento `name/size`, e a idempotência/ack de objeto desconhecido.
- Fora de escopo: mudança do formato de notificação (`JSON_API_V1`), migração para
  pull subscription, e o domínio custom (`frontend_domain`).
