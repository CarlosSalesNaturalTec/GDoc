# Design — expiracao-permissoes

## Context

`grants` (`0007_grants.sql`) hoje é uma linha por `(unit_id, subject_user_id,
resource_type, resource_id, permission)`, sem noção de tempo — uma concessão vale
até ser apagada por `DELETE /grants/:id`.

A resolução de acesso vive em `apps/api/src/lib/access.ts` e tem **duas** formas,
ambas precisando do mesmo tratamento de vencimento:

- `hasAccess(client, ctx, resourceType, resourceId, permission)` — verificação
  pontual por recurso, usada pelas rotas de conteúdo;
- `resourceScopeClause(...)` — **fragmento SQL** de alcance, usado por
  `visibleResourceClause` (listagem viva), por `routes/search.ts` e por
  `routes/trash.ts`. Esquecer este segundo caminho faria um grant vencido
  continuar exibindo itens em listagem e busca mesmo com a abertura já negada.

Precedente de rotina agendada: `jobs/purge-trash.ts` + `infra/terraform/
scheduler.tf` (Cloud Run Job + Cloud Scheduler, expurgo às 03:00), com
`SYSTEM_CTX` de papel `global_admin` para manutenção.

Restrições herdadas e não renegociadas: toda tabela com dado de unidade exige
`unit_id` + policy RLS; nunca `SET` de sessão, sempre `SET LOCAL` por transação;
o bypass de `global_admin` vale **só para agregados**, nunca para conteúdo ou
auditoria de outra unidade.

## Goals / Non-Goals

**Goals:**

- Prazo opcional por concessão, com corte automático e confiável.
- Corte que **não dependa** de nenhuma rotina ter rodado.
- Cobrir os dois cenários da US 4.3, incluindo os avisos.
- Introduzir o canal de notificação como **seam**, não como acoplamento a um
  provedor.
- Preservar a trilha: saber que alguém teve acesso e até quando.

**Non-Goals:**

- E-mail (D5), preferências de notificação, outros eventos notificáveis.
- Prazo para concessão a grupo (grupo não existe).
- Renovação automática.

## Decisions

### D1 — O corte é um predicado de consulta, não um efeito de job

`expires_at timestamptz NULL` em `grants`. Nulo = permanente (comportamento atual,
sem backfill). A resolução passa a exigir:

```
grant válido  ⟺  expires_at IS NULL OR expires_at > now()
```

aplicado **nos dois** caminhos de `lib/access.ts` — o `SELECT` de `hasAccess` e o
fragmento de `resourceScopeClause`.

_Alternativa descartada:_ um job que **apaga** grants vencidos. Seria mais simples
de ler, mas o acesso permaneceria vivo entre o vencimento e a próxima execução da
rotina — uma janela de até 24 h em que um acesso "encerrado" ainda abre arquivo.
Para um produto cujo núcleo é governança de acesso, isso é inaceitável. Com o
predicado, o corte é **instantâneo, fail-closed e independente de infraestrutura
de agendamento**: se o job nunca rodar, o acesso ainda assim para no segundo
exato. O job fica responsável apenas pelos **avisos**, que são cosméticos em
relação à segurança.

Consequência assumida: todo caminho de leitura paga um predicado a mais. É
desprezível — o índice de lookup `(subject_user_id, resource_type, permission)`
continua servindo, e `expires_at` entra como filtro residual.

### D2 — Expirar ≠ revogar: a linha permanece

Grant vencido **não é apagado**. `DELETE /grants/:id` (revogar) continua removendo
a linha; o vencimento apenas torna a linha inerte para efeito de acesso.

Razão: o produto existe para provar quem teve acesso a quê. Apagar a concessão no
vencimento destruiria exatamente a informação que torna a auditoria interpretável
— um evento de `download` de seis meses atrás ficaria órfão, sem nada que explique
sob qual autorização aconteceu. Manter a linha custa uma coluna e preserva a
narrativa.

Em "Concessões vigentes", a listagem passa a distinguir **vigente** de
**expirada** (com a data), em vez de esconder. O nome da seção na interface deixa
de ser preciso e deve acompanhar.

### D3 — Reconceder atualiza o prazo (o `ON CONFLICT` muda)

Hoje `routes/grants.ts:93` insere com `ON CONFLICT (…) DO NOTHING`. Com prazo,
isso vira armadilha: o admin reconcede um verbo já concedido informando um prazo
novo, a operação retorna sucesso e **nada acontece** — o acesso não foi estendido,
mas ninguém foi avisado disso.

Passa a `ON CONFLICT (…) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
atualizando também `granted_by` e o momento da concessão, para que a trilha reflita
quem estendeu.

Regras explícitas, porque ambas são intuitivas em direções opostas:

- reconceder **com** prazo sobre grant existente ⇒ o prazo passa a valer
  (estende ou encurta — o último ato administrativo vence);
- reconceder **sem** prazo sobre grant que tinha prazo ⇒ torna-se **permanente**.

A segunda é a que mais surpreende, então a interface deve deixar o estado atual
visível ao reconceder, e não oferecer o campo em branco como se fosse neutro.

Isso mantém a idempotência que a spec de `permissoes-granulares` exige (não
duplica, não falha), mas deixa de ser inércia total: passa a ser convergência para
o estado pedido.

### D4 — Aviso in-app com seam, não e-mail

Novo `NotificationPort` em `apps/api/src/ports/`, com adapter que **persiste em
tabela** e é lido pela SPA. Escolhido em vez de e-mail para esta fatia porque:

- **e-mail é um épico disfarçado** — domínio de envio verificado, segredo de
  provedor no Secret Manager, bounce, reputação, opt-out, template. Nada disso é
  o assunto da US 4.3;
- o sandbox de desenvolvimento não tem saída para provedor externo, e a paridade
  dev↔prod do projeto é mantida por seams — um adapter in-app roda igual nos dois
  ambientes, um adapter de e-mail exigiria um fake;
- a US 4.3 diz "a pessoa é avisada" e "a área administrativa é avisada", sem
  especificar meio. In-app satisfaz literalmente, e é o meio em que o aviso chega
  **no contexto onde a ação é tomada**.

O ponto do seam é que o e-mail depois entra como adapter novo, escolhido em
`ports/index.ts::createPorts()` por configuração, **sem tocar** no job nem na
regra de expiração.

```
      jobs/notify-expiring-grants.ts        (regra: quem avisar, quando)
                    │
                    ▼
        ports/NotificationPort              ← seam
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
   InAppNotificationAdapter   EmailNotificationAdapter
   (tabela notifications)     (fatia futura — D5)
```

### D5 — `notifications` é tenant-scoped e deduplicada na origem

Tabela nova com dado de unidade ⇒ **obrigatoriamente** `unit_id` + `ENABLE`/
`FORCE ROW LEVEL SECURITY` + policy `unit_isolation` no formato de `0002`. Sem
exceção — é regra dura do projeto.

Colunas relevantes: `recipient_user_id`, `kind` (`grant_expiring` /
`grant_expired`), `payload` (recurso, verbo, data de vencimento), `source_ref`,
`created_at`, `read_at`.

`source_ref` existe para **idempotência**: um índice único sobre
`(recipient_user_id, kind, source_ref)` garante que reexecutar o job — por retry
do Scheduler, por deploy no meio da janela, por operação manual — não produza
avisos duplicados. `source_ref` identifica o grant e o evento
(ex.: grant + vencimento), não o instante da execução; ancorar no tempo de
execução derrotaria o propósito.

Isso é o que permite o job ser burro e reexecutável, em vez de manter estado
próprio de "até onde já processei".

### D6 — Quem é avisado, e quando

| Evento | Destinatário | Momento |
|---|---|---|
| Vencimento se aproxima | a **pessoa** que recebeu a concessão | janela configurável antes do vencimento, default **7 dias** |
| Prazo atingido, acesso cortado | os **administradores da unidade do grant** | na primeira execução após o vencimento |

Sobre a janela de **7 dias**: valor **confirmado pelo cliente**. É o menor prazo
que ainda permite uma reação administrativa útil (pedir renovação, concluir o
trabalho) sem gerar aviso tão antecipado que se perca. Permanece em `config.ts` e
não fixa no código — a spec exige configurabilidade, então 7 dias é o *default*
da implantação, não uma constante.

Sobre "a área administrativa" do cenário 2: são os `unit_admin` **da unidade do
grant**. Deliberadamente **não** inclui `global_admin` — a trava de bypass do
projeto diz que o admin global não é olho universal sobre conteúdo e auditoria de
outra unidade, e a lista de acessos cortados de uma unidade é exatamente esse
tipo de informação. Incluí-lo reabriria pela porta da notificação um furo fechado
nas rotas.

O job também **não** avisa a pessoa no momento do corte — o cenário 2 pede aviso à
administração, e a pessoa já foi avisada no cenário 1. Avisar duas vezes a mesma
pessoa transforma o canal em ruído.

### D7 — Job separado, horário separado

Novo `jobs/notify-expiring-grants.ts` + Cloud Run Job + Cloud Scheduler, no molde
exato do expurgo (`SYSTEM_CTX` com papel `global_admin` de manutenção, mesma
estrutura de sumário e de tratamento de falha parcial).

**Job separado**, não uma etapa acrescentada ao `purge-trash`: os dois têm
domínios distintos (retenção de conteúdo vs. ciclo de permissão), falhas
independentes e cadências que podem divergir. Acoplá-los faria a falha de um
mascarar a do outro.

**Horário separado** das 03:00 do expurgo — o expurgo apaga bytes e pode ser
longo; sobrepor a varredura de grants concorreria por conexões de banco no pior
momento. Um deslocamento de alguns minutos basta e é configurável, como
`trash_purge_schedule` já é.

Falha do job **não** afeta acesso: o corte já aconteceu por D1. Um job que falha
degrada avisos, não segurança — e essa separação é o ponto principal do desenho.

## Risks / Trade-offs

- **Dois caminhos de resolução a alterar.** `hasAccess` e `resourceScopeClause`
  alimentam vias diferentes (recurso, listagem, busca, lixeira). Esquecer um
  deixaria grant vencido ainda listando itens. Mitigação: teste por **via**, não
  só por função — cada via ganha caso próprio de grant vencido.
- **Mudança de `DO NOTHING` para `DO UPDATE`.** Altera comportamento de uma rota
  existente. É intencional (D3) e a spec de `permissoes-granulares` é atualizada
  para refleti-lo, em vez de deixar dois comportamentos concorrentes na
  documentação.
- **Canal de notificação novo é superfície nova.** Mitigado por `unit_id` + RLS
  (D5) e por o conteúdo do aviso não carregar bytes nem trilha de auditoria —
  apenas referência a um recurso e uma data.
- **Aviso in-app só chega se a pessoa entrar.** Limitação real e assumida: quem
  não acessa o sistema durante a janela não vê o aviso prévio. É precisamente o
  que o adapter de e-mail resolve depois, e o motivo de D4 investir no seam em
  vez de na entrega.
- **Relógio.** O corte usa `now()` do banco, não do processo de aplicação, para
  que a decisão seja tomada num único relógio, consistente entre instâncias da
  Cloud Run.

## Migration Plan

1. Migração `0013` (aditiva): `expires_at` nulo em `grants` — **nenhum backfill**,
   nulo já significa permanente, então todo grant existente permanece válido e
   nada muda de comportamento no momento da aplicação. Tabela `notifications` +
   RLS + índice de deduplicação.
2. `packages/shared` (DTOs) → rebuild de `dist`.
3. `lib/access.ts` (predicado nos dois caminhos) — **antes** das rotas, para que
   a semântica de corte exista antes de qualquer prazo poder ser gravado.
4. `routes/grants.ts` (prazo + `ON CONFLICT DO UPDATE`), `NotificationPort` +
   adapter, `routes/notifications.ts`.
5. Job + Terraform (Cloud Run Job, Scheduler, IAM) + script de dev.
6. Web (campo de prazo, coluna de vencimento, central de notificações).
7. Documentação: remover a seção 10 do manual (este é o último item dela) e
   atualizar 6.4.

A ordem 3→4 importa: se a rota aceitasse prazo antes de a resolução respeitá-lo,
haveria uma janela em que um acesso "temporário" seria de fato permanente.

## Open Questions

- **Aviso ao conceder.** A pessoa deveria ser notificada no momento em que recebe
  uma concessão com prazo, além do aviso prévio? A US não pede; seria coerente,
  mas é escopo adicional.
- **Concessões já existentes.** Todas permanecem permanentes (nulo). Se o cliente
  quiser aplicar prazo retroativo a concessões antigas, isso é uma operação
  administrativa em massa que esta fatia não oferece.
