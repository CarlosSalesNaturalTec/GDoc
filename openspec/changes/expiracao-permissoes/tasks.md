# Tasks — expiracao-permissoes

> Ordem obrigatória: a resolução de acesso (seção 3) precisa respeitar o
> vencimento **antes** de a rota aceitar prazo (seção 4). Inverter cria uma
> janela em que um acesso "temporário" gravado é de fato permanente
> (design.md, Migration Plan).

## 1. Banco (migração aditiva `0013`)

- [ ] 1.1 `apps/api/src/db/migrations/0013_*.sql`: coluna `expires_at timestamptz
  NULL` em `grants`. **Sem backfill** — nulo já significa permanente, então toda
  concessão existente permanece válida.
- [ ] 1.2 Índice de apoio à varredura do job por vencimento próximo, sem
  prejudicar o índice de lookup existente `(subject_user_id, resource_type,
  permission)`.
- [ ] 1.3 Tabela `notifications`: `id`, `unit_id` → units, `recipient_user_id` →
  users, `kind`, `payload`, `source_ref`, `created_at`, `read_at`.
- [ ] 1.4 `ENABLE`/`FORCE ROW LEVEL SECURITY` + policy `unit_isolation` em
  `notifications`, no **mesmo formato** de `0002_enable_rls.sql` (regra dura do
  projeto — tabela com dado de unidade exige `unit_id` + RLS).
- [ ] 1.5 Índice **único** `(recipient_user_id, kind, source_ref)` — é o que torna
  o job reexecutável sem duplicar aviso (design.md D5).
- [ ] 1.6 `npm run migrate --workspace apps/api` e confirmar aplicação.

## 2. DTOs compartilhados (packages/shared)

- [ ] 2.1 `expiresAt` (opcional) nos DTOs de grant — request de concessão e
  response de listagem, esta última também expondo o estado vigente/expirada.
- [ ] 2.2 Enum de tipo de notificação (`grant_created`, `grant_expiring`,
  `grant_expired`) e DTOs de notificação, com o payload comportando **lista de
  verbos** (um aviso cobre vários verbos do mesmo recurso e prazo).
- [ ] 2.3 `npm run build --workspace packages/shared`.

## 3. Resolução de acesso (o corte)

- [ ] 3.1 `apps/api/src/lib/access.ts`: adicionar o predicado de vigência
  (`expires_at IS NULL OR expires_at > now()`) ao ramo de grant em **`hasAccess`**.
- [ ] 3.2 Adicionar o **mesmo** predicado ao fragmento de
  **`resourceScopeClause`** — é o caminho que alimenta `visibleResourceClause`
  (listagem), `routes/search.ts` e `routes/trash.ts`. Esquecer este ponto deixa
  grant vencido ainda listando itens (design.md, Risks).
- [ ] 3.3 Usar `now()` **do banco**, não relógio do processo, para consistência
  entre instâncias da Cloud Run (design.md, Risks).
- [ ] 3.4 Confirmar que os ramos de **posse** e **admin da unidade** permanecem
  sem prazo.

## 4. API — concessão com prazo

- [ ] 4.1 `apps/api/src/routes/grants.ts`: aceitar `expiresAt` opcional no
  `POST /grants`, validando que é data futura.
- [ ] 4.2 Trocar `ON CONFLICT … DO NOTHING` por `DO UPDATE SET expires_at =
  EXCLUDED.expires_at`, atualizando também `granted_by` (design.md D3). Reconceder
  **sem** prazo sobre grant com prazo ⇒ torna permanente.
- [ ] 4.3 `GET /grants`: devolver `expiresAt` e o estado vigente/expirada, **sem**
  ocultar as expiradas (design.md D2).
- [ ] 4.4 `DELETE /grants/:id` (revogar) permanece removendo a linha — inalterado.
- [ ] 4.5 Emitir o aviso `grant_created` quando a operação envolver prazo: **após
  o commit** da transação, **fora** dela, com falha registrada e **descartada** —
  jamais propagada ao chamador (design.md D8). Concessão sem prazo não avisa.
- [ ] 4.6 Agrupar a emissão por `(recurso, vencimento)`: uma requisição com vários
  verbos sobre o mesmo recurso e prazo emite **um** aviso enumerando os verbos
  (design.md D5).

## 5. Canal de notificação (seam + adapter)

- [ ] 5.1 Criar `apps/api/src/ports/notification-port.ts` com a interface de
  emissão (destinatário, tipo, payload, `source_ref`).
- [ ] 5.2 Criar o adapter in-app em `apps/api/src/adapters/` persistindo em
  `notifications`, com upsert que absorve a colisão do índice único (idempotência).
- [ ] 5.2a Compor `source_ref` a partir de **`(recurso, vencimento)`** — nunca do
  id do grant nem do instante da execução (design.md D5). É o que colapsa os
  verbos num aviso e o que faz a mudança de prazo notificar de novo.
- [ ] 5.3 Plugar em `ports/index.ts::createPorts()` — **único** ponto de escolha
  da implementação ativa (design.md D4).
- [ ] 5.4 Novo `apps/api/src/routes/notifications.ts`: listar as próprias, contar
  não lidas, marcar como lida. Rota tenant-scoped, sob `attachTenantContext`.
- [ ] 5.5 Registrar o router em `app.ts` **e** acrescentar o prefixo às **três**
  listas em sincronia: `lib/api-prefixes.ts`, `apps/web/vite.config.ts`
  (`API_PROXY_PREFIXES`) e `infra/terraform/locals.tf` (`api_proxy_prefixes`).
  Atualizar `__tests__/web-serving.test.ts`.

## 6. Rotina de avisos

- [ ] 6.1 `apps/api/src/config.ts`: janela de antecedência do aviso, default
  **7 dias** (confirmado pelo cliente), configurável por ambiente (design.md D6).
- [ ] 6.2 Criar `apps/api/src/jobs/notify-expiring-grants.ts` no molde de
  `jobs/purge-trash.ts` (`SYSTEM_CTX` de manutenção, sumário, tolerância a falha
  parcial).
- [ ] 6.3 Aviso prévio → **pessoa destinatária** da concessão, para vencimentos
  dentro da janela. Concessões sem prazo são ignoradas.
- [ ] 6.4 Aviso de corte → **`unit_admin` da unidade do grant**. **Não** incluir
  `global_admin` fora dessa unidade (design.md D6 — a trava do bypass vale aqui
  também). **Não** avisar novamente a pessoa afetada.
- [ ] 6.5 Script de dev `npm run notify:grants --workspace apps/api`, no formato
  de `purge:trash`.

## 7. Infraestrutura (Terraform/GCP)

- [ ] 7.1 Cloud Run Job para a rotina de avisos, no molde do job de expurgo.
- [ ] 7.2 Cloud Scheduler + IAM de invocação, com variável própria de agendamento
  (espelhando `trash_purge_schedule`), em horário que **não** colida com as 03:00
  do expurgo (design.md D7).
- [ ] 7.3 Variável de ambiente da janela de antecedência no serviço/job.

## 8. Web

- [ ] 8.1 `apps/web/src/permissoes/`: campo de prazo **opcional** ao conceder,
  exibindo o prazo atual ao reconceder — não oferecer o campo em branco como se
  fosse neutro (design.md D3).
- [ ] 8.2 Coluna de vencimento e marcação visual de **expirada** na listagem de
  concessões; ajustar o rótulo da seção, que deixa de ser só "vigentes".
- [ ] 8.3 `apps/web/src/shell/`: central de notificações com contagem de não
  lidas e marcação de lida.

## 9. Testes (API)

- [ ] 9.1 Grant vencido não concede acesso a recurso (view/download/rename/
  upload/delete) — 403, sem URL, sem auditoria.
- [ ] 9.2 Grant vencido **por via**: não aparece na **listagem**, nem na **busca**,
  nem na **lixeira** (um caso por via — cobre o risco de esquecer
  `resourceScopeClause`).
- [ ] 9.3 Grant com prazo futuro concede normalmente; posse e admin da unidade não
  são afetados por prazo.
- [ ] 9.4 Reconceder com prazo mais distante estende; com prazo mais próximo
  encurta; sem prazo torna permanente. Nenhum caso duplica linha.
- [ ] 9.5 Concessão expirada permanece na listagem, marcada; revogar remove.
- [ ] 9.6 Job: aviso prévio ao destinatário dentro da janela; concessão sem prazo
  não gera aviso.
- [ ] 9.6a Concessão **com** prazo avisa a pessoa no ato; **sem** prazo não avisa.
- [ ] 9.6b Vários verbos no mesmo recurso e prazo ⇒ **uma** notificação enumerando
  os verbos.
- [ ] 9.6c Reconceder alterando o prazo notifica de novo; reconceder com o **mesmo**
  prazo não.
- [ ] 9.6d Falha na emissão do aviso **não** reverte a concessão nem faz
  `POST /grants` retornar erro (design.md D8).
- [ ] 9.7 Job: aviso de corte aos `unit_admin` **da unidade do grant**;
  administradores de outra unidade não recebem; pessoa afetada não é avisada de
  novo.
- [ ] 9.8 Job **idempotente**: duas execuções ⇒ uma notificação.
- [ ] 9.9 Falha parcial na emissão não interrompe o restante; sumário registra.
- [ ] 9.10 `notifications` isolada por RLS entre unidades; `global_admin` não
  alcança notificações de outra unidade.
- [ ] 9.11 Acesso permanece cortado com o job **nunca** executado (o teste que
  prova a separação de D1/D7).

## 10. Testes (Web)

- [ ] 10.1 Campo de prazo opcional; conceder sem prazo continua funcionando.
- [ ] 10.2 Listagem distingue vigente de expirada.
- [ ] 10.3 Contagem de não lidas e marcação de lida no shell.

## 11. Documentação

- [ ] 11.1 `docs/manual_do_usuario.md`: **remover a seção 10 inteira** — com esta
  entrega ela fica sem itens (o download compactado sai na change
  `download-pasta-zip`). Ajustar a numeração e o rodapé.
- [ ] 11.2 Seção 6.4: descrever o prazo opcional, o comportamento de reconceder e
  a distinção entre expirada e revogada.
- [ ] 11.3 Documentar a central de notificações na seção 4 (conhecendo a tela) e
  os avisos de expiração no guia do administrador.

## 12. Verificação

- [ ] 12.1 `npm run lint && npm run build && npm run test` na raiz.
- [ ] 12.2 Exercício manual: conceder com prazo curto, confirmar corte no
  vencimento **sem** rodar o job, depois rodar `npm run notify:grants` e conferir
  os avisos nos dois destinatários.
- [ ] 12.3 Conferir que a janela default resolvida em runtime é de 7 dias e que
  alterá-la por variável de ambiente muda o comportamento sem rebuild.
