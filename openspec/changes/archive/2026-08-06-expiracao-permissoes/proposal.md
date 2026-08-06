# Proposal — expiracao-permissoes

## Why

A **US 4.3** do PRD (`docs/prd_final.md`) prevê prazo de expiração opcional para
uma permissão, "para que acessos temporários se encerrem sozinhos". O
`docs/manual_do_usuario.md` seção 10 já anuncia o recurso como previsto e
indisponível, e a seção 6.4 informa que hoje as permissões "valem até serem
**revogadas manualmente**".

O `epico-4-permissoes-granulares` registrou a US 4.3 explicitamente como **Fatia
B**, adiada por depender de uma rotina agendada — dependência hoje satisfeita: o
`epico-6-lixeira-retencao` entregou o padrão de Cloud Run Job + Cloud Scheduler
(`jobs/purge-trash.ts`, `infra/terraform/scheduler.tf`), e o próprio
`openspec/config.yaml` já descreve a topologia de produção como incluindo
"avisos de expiração de permissão".

A US 4.3 tem dois critérios de aceitação, e eles pedem coisas de naturezas muito
diferentes:

1. **O corte automático no vencimento** — barato: é um predicado a mais na
   resolução de acesso.
2. **Os avisos** — "a pessoa é avisada previamente" (cenário 1) e "a área
   administrativa é avisada do corte" (cenário 2). **Não existe nenhum canal de
   notificação no sistema**: nem e-mail, nem in-app, nem qualquer adapter de
   envio. É infraestrutura de zero a um, e é o grosso desta mudança.

Há ainda um detalhe que impede a entrega ingênua: `POST /grants` insere com
`ON CONFLICT … DO NOTHING` (`routes/grants.ts:93`). Reconceder um verbo já
concedido com um prazo novo seria **silenciosamente ignorado** — o admin acharia
que estendeu o acesso e não teria estendido nada.

## What Changes

- **Prazo opcional na concessão** (US 4.3) — `grants` ganha `expires_at`
  (nulo = permanente, comportamento atual preservado). `POST /grants` aceita o
  prazo; `GET /grants` o devolve. Migração aditiva `0013`.
- **Corte na resolução de acesso, não por rotina** — `hasAccess` e os fragmentos
  de alcance de listagem passam a desconsiderar grant vencido. O corte é
  **imediato e fail-closed por construção**: não depende de nenhum job ter
  rodado.
- **Reconceder com prazo novo estende o acesso** — o `ON CONFLICT` passa de
  `DO NOTHING` para atualizar o prazo, de modo que renovar um acesso temporário
  seja possível e observável. Reconceder sem prazo sobre grant com prazo o torna
  permanente, explicitamente.
- **Expirar não é revogar** — o grant vencido **permanece registrado**, marcado
  como expirado na listagem de concessões, preservando a trilha de quem teve
  acesso e até quando. Revogar continua removendo a linha.
- **Canal de notificação in-app** — novo seam `NotificationPort` com adapter que
  persiste em tabela `notifications` (tenant-scoped: `unit_id` + RLS), e leitura
  no shell da SPA. É a infraestrutura mínima que satisfaz os dois cenários da
  US 4.3 sem introduzir dependência externa.
- **Aviso no ato da concessão** — quem recebe uma concessão **com prazo** é
  avisado imediatamente pela própria rota, sem esperar rotina agendada. A falha do
  aviso nunca derruba a concessão: o grant é o ato autoritativo, a notificação é
  efeito colateral pós-commit.
- **Rotina diária de avisos** — novo job `notify-expiring-grants`, no molde do
  `purge-trash`: avisa a **pessoa** quando o vencimento se aproxima (janela
  configurável, default 7 dias) e avisa a **administração da unidade** quando o
  prazo é atingido. Idempotente: rodar duas vezes no mesmo dia não duplica aviso.
- **Um aviso por recurso e vencimento, não por verbo** — conceder três verbos
  sobre a mesma pasta com o mesmo prazo produz **uma** notificação enumerando os
  verbos, não três. É o que impede o canal de nascer ruidoso.
- **Interface** — campo de prazo opcional ao conceder; coluna de vencimento e
  marcação de expirada em "Concessões vigentes"; central de notificações no
  shell.
- **Manual do usuário** — a seção 10 fica **vazia e é removida**, já que este é o
  seu último item pendente; as seções 6.4 e 5.x descrevem prazo e avisos.

Fora de escopo (registrado em design.md):

- **Notificação por e-mail.** O `NotificationPort` nasce com o formato que a
  comporta como adapter futuro, mas esta fatia entrega apenas in-app — e-mail
  exige domínio de envio, segredo no Secret Manager, tratamento de bounce e
  política de opt-out, que são um épico próprio. Ver D5.
- **Preferências de notificação por pessoa** (silenciar, frequência).
- **Notificações para outros eventos** (upload concluído, item prestes a ser
  expurgado da lixeira). O canal fica genérico, mas só a expiração o usa aqui.
- **Prazo em concessão a grupo** — grupo continua não existindo (D7 do
  `epico-4-permissoes-granulares`).
- **Renovação automática** de acessos temporários.

## Capabilities

### New Capabilities

- `notificacoes`: canal de notificação **in-app** por pessoa, tenant-scoped,
  atrás de um seam de aplicação (`NotificationPort`) para permitir outros meios
  de entrega sem tocar regra de negócio; com leitura, marcação de lida e
  idempotência de emissão por evento de origem.

### Modified Capabilities

- `permissoes-granulares`: a concessão passa a admitir **prazo de expiração
  opcional**; reconceder deixa de ser inerte quanto ao prazo e passa a
  atualizá-lo; a listagem de concessões passa a distinguir vigente de expirada.
- `controle-acesso`: a resolução de acesso passa a **desconsiderar concessão
  vencida**, em todas as vias — verificação por recurso e fragmentos de alcance
  de listagem, busca e lixeira.

## Impact

- **Banco (`apps/api/src/db/migrations`):** nova migração `0013` — coluna
  `expires_at timestamptz NULL` em `grants` (aditiva, sem backfill: nulo já
  significa "permanente"); índice para a varredura do job por vencimento
  próximo; nova tabela `notifications` (`unit_id` + RLS no formato de `0002`,
  `recipient_user_id`, `kind`, `payload`, `source_ref` para idempotência,
  `created_at`, `read_at`) com índice único de deduplicação.
- **API (`apps/api/src`):** `lib/access.ts` — predicado de não-vencimento em
  `hasAccess` e em `resourceScopeClause` (que alimenta listagem, busca e
  lixeira); `routes/grants.ts` — aceitar/devolver prazo, `ON CONFLICT DO UPDATE`;
  novo `ports/notification-port.ts` + adapter in-app em `adapters/`, plugado em
  `ports/index.ts::createPorts()`; novo `routes/notifications.ts` (listar, marcar
  lida); novo `jobs/notify-expiring-grants.ts`; `config.ts` ganha a janela de
  aviso.
- **Shared (`packages/shared/src`):** `expiresAt` nos DTOs de grant; DTOs de
  notificação e enum de tipo (`grant_created`, `grant_expiring`, `grant_expired`);
  rebuild de `dist`.
- **Web (`apps/web/src`):** campo de prazo em `permissoes/`; coluna de vencimento
  e marcação de expirada; central de notificações no `shell/`.
- **Infra (`infra/terraform`):** novo Cloud Run Job + Cloud Scheduler para os
  avisos, no molde de `scheduler.tf` (job de expurgo), em horário que **não**
  colida com as 03:00 do expurgo.
- **Paridade de dev:** `npm run notify:grants --workspace apps/api`, no mesmo
  formato de `npm run purge:trash`.
- **Testes:** grant vencido não concede em nenhuma via (recurso, listagem, busca,
  lixeira); reconceder estende; expirada permanece listada; job idempotente;
  destinatário do aviso de corte é a administração **da unidade do grant**;
  `notifications` isolada por RLS entre unidades.
