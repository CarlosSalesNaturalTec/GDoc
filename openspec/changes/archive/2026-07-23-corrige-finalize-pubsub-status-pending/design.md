## Context

Bug de produção: arquivos ficam presos em `status='pending'` porque o endpoint de
reconciliação não entende o transporte de produção. Diagnóstico completo no
`proposal.md`. Este documento registra as decisões de design do recorte.

Estado atual relevante:

- `apps/api/src/routes/storage-events.ts` reconcilia cota e promove o status
  (`pending → active`, `replacing → active`) a partir de `{ objectPath, sizeBytes }`.
- `infra/terraform/pubsub.tf` já provisiona: tópico, `google_storage_notification`
  (`OBJECT_FINALIZE`, `payload_format = "JSON_API_V1"`) e uma **push subscription**
  com `oidc_token` (SA dedicada `${name_prefix}-pubsub-push`). O `push_endpoint` é
  `${cloud_run.uri}/internal/storage-events`.
- O Cloud Run concede `allUsers:run.invoker` (a API precisa ser pública para o
  SPA), então o IAM do Cloud Run **não** restringe esse endpoint — a autenticação
  precisa ser feita na aplicação (gap já anotado no `infra/terraform/README.md`).

## Goals / Non-Goals

**Goals:**
- O finalize de produção (Pub/Sub push + GCS `JSON_API_V1`) reconcilia a cota e
  promove o arquivo a `active`.
- O endpoint autentica a notificação (OIDC) — deixa de ser efetivamente aberto.
- Não regredir o caminho de dev (chamada direta com payload simplificado).
- Destravar os arquivos já presos em `pending`/`replacing` (backfill).

**Non-Goals:**
- Trocar o formato de notificação ou migrar para pull subscription.
- Mexer no fluxo de emissão de URL ou no `put-object.ts` (estão corretos).
- Domínio custom (`frontend_domain`).

## Decisions

### D1 — Aceitar os dois formatos, detectando o envelope

O endpoint passa a detectar a forma do corpo:

- **Envelope do Pub/Sub push** (produção): `req.body.message.data` presente →
  decodifica base64 → `JSON.parse` do metadata do GCS (`JSON_API_V1`) → mapeia
  `name → objectPath` e `Number(size) → sizeBytes`. O `name` do GCS é a chave do
  objeto dentro do bucket (`{unit_id}/{owner_id}/{uuid}`), que é exatamente o
  `object_path`/`pending_object_path` gravado em `files` — o `SELECT ... WHERE
  object_path = $1 OR pending_object_path = $1` continua válido sem transformação.
- **Payload simplificado** (dev/E2E): `{ objectPath, sizeBytes }` direto, como
  hoje.

Alternativa descartada: mudar a prova de dev para mandar o envelope também.
Manter os dois formatos evita reescrever o harness de dev e preserva os testes
existentes; o custo é um `if` de detecção no início do handler.

### D2 — Validar o token OIDC do Pub/Sub na aplicação

O push chega com `Authorization: Bearer <JWT OIDC>` assinado pelo Google para a
SA `${name_prefix}-pubsub-push`, com `aud` = URL do serviço Cloud Run. O endpoint
valida assinatura (JWKS do Google) + `aud` + (opcionalmente) o `email` do
emissor. Fail-closed: sem token válido → `401`, sem tocar no banco.

- A `audience` esperada vem de config (a URL do Cloud Run / `push_endpoint`). Em
  dev, a validação OIDC é **desligada** por config (o atalho direto não tem token)
  — mesma filosofia de paridade dev↔prod dos outros seams.
- Alternativa descartada: tornar o Cloud Run privado só para esse path — inviável
  sem quebrar o acesso público do SPA (mesmo racional do README).

### D3 — Ack de objeto desconhecido (2xx), não 404

O `404` atual faz o Pub/Sub re-tentar em loop uma notificação que nunca vai
casar (objeto sem registro correspondente — ex.: objeto removido, ou evento
duplicado tardio). Passa a responder **2xx** ("reconhecido, nada a fazer") para
drenar a mensagem. Só payload/token inválido retorna erro (`400`/`401`). A
reconciliação continua **idempotente**: reprocessar um objeto já `active` não
altera o resultado (o status já não é `pending`/`replacing`).

### D4 — Backfill dos registros já presos

Rotina one-shot (script `npm run` ou Job pontual) que, para cada arquivo em
`pending`/`replacing`, verifica no `StoragePort` se o objeto existe e seu tamanho,
e então aplica a mesma reconciliação (promove a `active`, soma a cota). Reusa a
lógica do handler para não duplicar regra. Executada uma vez após o deploy do fix.

## Risks / Trade-offs

- **JWKS/latência de validação OIDC** → cachear as chaves públicas do Google
  (biblioteca de verificação já faz isso); a validação é local após o primeiro
  fetch.
- **Config de `audience` divergente do `push_endpoint`** → se a URL usada no
  `aud` não bater, todo push vira `401`. Mitigar derivando a audience da mesma
  fonte do `push_endpoint` e cobrindo com teste; documentar o valor esperado.
- **Backfill contando cota em dobro** → rodar só uma vez e apenas sobre
  `pending`/`replacing` (que ainda não foram somados); a reconciliação é idempotente
  por status, então reexecução não soma de novo.
- **Ordem de deploy** → o fix de código precisa estar no Cloud Run antes de
  confiar no finalize; até lá, o backfill cobre o passivo e novos uploads só
  reconciliam após o deploy.

## Migration Plan

1. Deploy da imagem da API com o endpoint corrigido (CI/CD em `main`).
2. Confirmar nos logs que `/internal/storage-events` passou a responder `2xx`
   (o Pub/Sub reentrega as mensagens ainda retidas na subscription).
3. Rodar o backfill uma vez para os registros anteriores ao deploy que já não
   tenham reentrega pendente.
4. Validar no SPA de produção que um upload novo chega a `active`.

Rollback: reverter a imagem da API. O `pubsub.tf` não muda, então não há
rollback de infra.

## Open Questions

- Confiar só na reentrega do Pub/Sub (mensagens retidas por até 7 dias) pode
  dispensar o backfill para os uploads muito recentes — decidir na implementação
  se o backfill cobre todo o passivo ou só o que já expirou da subscription.
