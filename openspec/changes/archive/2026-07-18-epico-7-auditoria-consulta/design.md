## Context

O registro de auditoria já existe e é **populado** desde a fundação: a tabela
`audit_events` (migração `0001`: `unit_id`, `user_id`, `file_id`, `action`,
`created_at`) tem RLS por `unit_id` (`0002`) e é gravada em `routes/files.ts` a
cada emissão de `view-url`/`download-url` — o ponto de auditoria é a **emissão
da URL**, não a transferência confirmada de bytes ("requested = accessed", MVP).
As migrações `0004` e `0008` ampliaram o `CHECK` de `action` para incluir
`upload`/`rename`/`replace`/`delete`/`restore`, então a tabela guarda mais do
que só acesso.

O que **falta** é o lado de leitura (Épico 7). O padrão de autorização já está
consolidado em `apps/api/src/lib/access.ts`: `isAdminOfUnit(ctx, resourceUnitId)`
(admin da unidade **do recurso**, com a trava explícita que impede o
`global_admin` de virar "olho universal" sobre outra unidade) e o filtro padrão
`deleted_at IS NULL` para não enxergar itens na lixeira. Esta fatia acrescenta
uma via de leitura reusando esse padrão, sem migração de schema nova (a não ser
um índice de leitura opcional) e sem port novo.

## Goals / Non-Goals

**Goals:**
- Expor `GET /files/:id/audit` retornando os eventos de acesso (`view`/
  `download`) do arquivo, com ator (quem), ação (qual) e `created_at` (quando).
- Autorizar a consulta **exatamente** para dono do arquivo OU admin da unidade
  do arquivo (RF #9/#11) — mais estrito que `hasAccess`, sem o ramo de grant.
- Preservar isolamento por unidade via RLS já existente e o comportamento
  fail-closed sem vazar existência (403), igual às rotas de acesso.

**Non-Goals:**
- Alterar como os eventos são **gravados** (lado de escrita intocado).
- Feed agregado multi-arquivo, exposição dos eventos não-acesso
  (upload/rename/…), paginação por cursor, retenção pós-expurgo, UI/SPA.

## Decisions

### D1 — Endpoint por arquivo: `GET /files/:id/audit`
Uma rota por arquivo satisfaz **os dois** cenários do PRD: o admin consulta a
auditoria de um arquivo (US 7.1) e o dono consulta a de um arquivo que enviou
(US 7.2, "vejo os acessos aos arquivos que eu enviei"). A alternativa de um feed
agregado (`GET /audit?scope=owned`) é maior e não é exigida pelos critérios de
aceitação — fica fora de escopo. Fica em `routes/audit.ts` próprio (não em
`files.ts`) por coesão do domínio de leitura de auditoria, registrado em
`app.ts` sob `attachTenantContext(ports)` como as demais rotas tenant.

### D2 — Autorização "dono OU admin da unidade", **sem** grant
A consulta de auditoria é **mais estrita** que `hasAccess`. `hasAccess(view)`
concede a dono, admin da unidade **e** a quem tem grant `view`/`download`. Ver
*quem mais* acessou o arquivo é um direito de **dono/administrador** (RF #9:
"o remetente torna-se seu dono e recebe direito de consultar a auditoria
daquele arquivo"; RF #11: "consultável por administradores … e pelo dono"),
não um efeito colateral de poder abrir o arquivo. Então a regra é:

```
autorizado ⇔ arquivo vivo (deleted_at IS NULL)
             E ( arquivo.owner_id = ctx.userId
                 OU isAdminOfUnit(ctx, arquivo.unit_id) )
```

Reusa `isAdminOfUnit` de `lib/access.ts` (mesma semântica de bypass travado do
`global_admin`). Deliberadamente **não** consulta `grants`. Um pequeno helper
`canReadAudit(client, ctx, fileId)` em `lib/access.ts` encapsula essa resolução
(mesmo shape do `SELECT owner_id, unit_id FROM files … deleted_at IS NULL` já
usado em `hasAccess`), retornando o suficiente para a rota decidir 403 vs 200.

**Alternativa considerada:** reusar `hasAccess(view)` direto — rejeitada, pois
vazaria a lista de acessos para qualquer grant-holder, violando a intenção de
US 7.2 ("não vejo registros de arquivos de outras pessoas" ⇒ a auditoria é do
dono/admin, não de qualquer um que possa ver o arquivo).

### D3 — Isolamento por unidade continua na RLS, não na aplicação
A rota roda na transação tenant (`withTenantTransaction`) já aberta pela camada
de rota; a RLS de `audit_events` por `unit_id` filtra por baixo. Para o dono
não-admin, o recorte adicional é implícito: só se chega ao `SELECT` de eventos
depois que D2 confirmou `owner_id = ctx.userId` **naquele** arquivo, então os
eventos retornados são de um arquivo que é dele. Não se reintroduz filtro de
unidade na aplicação — a fronteira é o banco (disciplina do repo).

### D4 — Fail-closed sem vazar existência (403, não 404)
Se D2 falhar — arquivo inexistente, na lixeira, de outra unidade (escondido pela
RLS) ou simplesmente não é seu — a resposta é **403 sem corpo de auditoria**,
sem distinguir os casos, idêntico ao que `files.ts` já faz para
`view-url`/`download-url` e alinhado à US 4.2 (bloqueio por link direto sem
expor existência). Consistência de código de status com o resto da API.

### D5 — Resposta: só eventos de acesso (`view`/`download`)
O `SELECT` filtra `action IN ('view','download')`, exatamente o escopo de RF #11
e das US 7.1/7.2 ("visualizou ou baixou"). Os demais tipos de evento existem na
tabela mas não são expostos nesta fatia (fora de escopo). Cada item traz o
**ator** (join `users u ON u.id = ae.user_id` → `id`, `name`, `email`), a
`action` e o `created_at`. O join roda na mesma transação tenant: como o evento
e o ator são da mesma unidade do arquivo, a RLS de `users` os enxerga.

### D6 — Ordenação desc + limite superior fixo, sem paginação
Retorno ordenado por `created_at DESC` (mais recente primeiro — é o que uma tela
de comprovação de acesso quer ver). Um limite superior fixo (constante interna,
ex.: 500) protege contra históricos gigantes sem introduzir contrato de cursor;
paginação real fica para quando o volume exigir (fora de escopo).

### D7 — Índice de leitura (avaliar)
A consulta filtra por `file_id` (+ `action`) e ordena por `created_at`. Hoje só
existe `audit_events_unit_id_idx`. Se o `EXPLAIN` justificar, adicionar índice
aditivo `audit_events (file_id, created_at DESC)` numa **nova** migração (nunca
editar uma aplicada). Em volume de MVP pode ser dispensável; decisão fica com a
medição na task de implementação. Sem impacto de schema além do índice.

## Risks / Trade-offs

- **[Vazar acesso via grant-holder]** → mitigado por D2: a autorização não
  passa por `grants`; só dono/admin. Teste dedicado (colaborador com grant
  `view` recebe 403).
- **[`global_admin` como olho universal]** → mitigado reusando `isAdminOfUnit`,
  que compara `arquivo.unit_id === ctx.unitId` — global_admin fora da sua
  unidade não consulta auditoria de conteúdo alheio (mesma disciplina D1 do
  `lib/access.ts`; agregados de painel do Épico 8 é que usam bypass, não isto).
- **[Distinguir 404 vs 403 vazaria existência]** → D4 unifica em 403.
- **[Auditoria de arquivo já expurgado]** → não é responsabilidade desta fatia;
  o expurgo (Épico 6) já apaga a auditoria junto. Item na lixeira (ainda não
  expurgado) resolve como inexistente (403) por D2/`deleted_at IS NULL`.

## Migration Plan

Sem migração de dados. Se D7 concluir pelo índice, é uma migração **aditiva**
(cria índice, `IF NOT EXISTS`), aplicável e reversível sem downtime. A rota é
puramente aditiva (novo endpoint GET) — nenhum comportamento existente muda,
rollback é remover a rota.

## Open Questions

- **Índice (D7):** confirmar por `EXPLAIN`/volume se `(file_id, created_at)`
  compensa já nesta fatia ou fica para quando o histórico crescer.
- **Limite superior (D6):** valor concreto do teto (ex.: 500) — ajustar na
  implementação conforme o que a UI futura consumirá.
