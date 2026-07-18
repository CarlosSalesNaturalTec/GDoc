## Context

O Épico 8 (US 8.2, RF #14) pede um painel gerencial com cartões e três gráficos
(**arquivos por tipo**, **envios por mês**, **espaço utilizado vs. disponível**),
"dentro do alcance" do administrador. Os dados já existem no banco desde os
épicos anteriores; falta só o **lado de leitura agregada**. Restrições herdadas
que esta fatia respeita sem reabrir:

- **Alcance por RLS** (Épico 5): a `withTenantTransaction` faz `SET LOCAL
  app.current_unit`/`app.user_role`; `unit_admin` fica preso à sua unidade,
  `global_admin` faz bypass e agrega tudo. Não se reimplementa alcance em código.
- **Cota já entregue** (US 8.1): `config.storageQuotaBytesPerUser` (10 GiB) e
  `users.storage_used_bytes` (mantido pelo `storage-events` de reconciliação) são
  a fonte do bloco de espaço — o painel só lê.
- **Ciclo de upload e lixeira**: `files.status ∈ {pending, active, over_quota}` e
  `files.deleted_at` (Épico 6). Só `active` + não-excluído é "conteúdo real".
- **`packages/shared` consumido compilado**: helper/DTO novos exigem rebuild.

## Goals / Non-Goals

**Goals:**
- Um endpoint agregado (`GET /dashboard`) que devolve os quatro blocos da US 8.2
  numa leitura consistente, com alcance correto para `unit_admin` e `global_admin`.
- Definição de "tipo de arquivo" num único lugar reutilizável (painel agora,
  filtros da US 9.1 depois).
- Métricas que refletem conteúdo real armazenado (exclui pending/over_quota/lixeira).

**Non-Goals:**
- UI/SPA (`apps/web`); parametrização (intervalos, filtros) do painel; cache/
  materialização; métricas fora das três da US 8.2; reabrir a cota (US 8.1).

## Decisions

### D1 — Alcance vem da RLS, não de um ramo de código
As agregações são `SELECT`s comuns sobre `files`/`users`/`audit_events` dentro da
transação tenant já aberta. A RLS por `unit_id` restringe automaticamente o
`unit_admin` à sua unidade; o `global_admin` faz bypass e agrega todas as
unidades. **Uma** implementação serve os dois alcances.
- *Alternativa rejeitada:* ramificar a query por papel (ex.: `WHERE unit_id = ...`
  para unit_admin). Duplicaria a regra de isolamento que a RLS já garante e criaria
  risco de divergência — exatamente o antipadrão que o Épico 5 evitou.

### D2 — Autorização admin-only a partir de `ctx.role`
A rota exige `ctx.role ∈ {unit_admin, global_admin}`; `collaborator` → **403**
antes de qualquer query. É a única checagem de papel explícita (não há grant nem
posse envolvidos — é um agregado, não um recurso).
- *Alternativa rejeitada:* liberar ao colaborador um painel "do que é meu". A US
  8.2 é explicitamente do administrador; um painel de colaborador seria outra
  história de usuário, fora de escopo.

### D3 — Endpoint único agregado, não um por métrica
`GET /dashboard` devolve `{ cards, filesByType, uploadsByMonth, storage }` numa só
resposta e numa só transação. Cartões e gráficos ficam **coerentes entre si**
(mesmo snapshot) e o cliente faz uma só ida ao servidor.
- *Alternativa rejeitada:* `GET /dashboard/files-by-type`, `/uploads-by-month`,
  etc. Mais round-trips e risco de números inconsistentes entre chamadas.

### D4 — "Arquivo" nas métricas = `status = 'active' AND deleted_at IS NULL`
Contagens, tipo e espaço só consideram arquivo vivo e efetivo. `pending`/
`over_quota` são ciclo de upload incompleto; itens na lixeira ainda existem na
tabela (soft-delete) mas não são conteúdo ativo. Este filtro é o **mesmo** em
todos os blocos, para os números baterem entre si.

### D5 — Categoria de tipo: query devolve `content_type`, API agrupa via helper compartilhado
A categorização MIME → categoria (`image`/`video`/`audio`/`pdf`/`office`/`text`/
`other`) vive em `packages/shared` (`fileCategory(contentType)`), porque SQL não
chama JS e porque a **mesma** definição de "tipo" precisa alimentar os filtros da
US 9.1 depois. A query agrega `SELECT content_type, count(*) ... GROUP BY
content_type`; a rota dobra os pares em categorias com o helper. O universo de
categorias é o enum das opções do PRD (imagens, vídeos, áudios, PDFs, documentos
de escritório, texto, outros).
- *Alternativa rejeitada:* `CASE` em SQL para bucketizar. Espalharia a definição
  de tipo em duas linguagens; a US 9.1 precisaria repeti-la.

### D6 — Envios por mês: trailing 12 meses com zero-fill na API
A query agrupa arquivos ativos por `date_trunc('month', created_at)` dos últimos
12 meses; a rota preenche com zero os meses ausentes, sempre devolvendo 12
entradas ordenadas (mês antigo → recente). Série estável = gráfico estável.
- *Alternativa rejeitada:* `generate_series` no SQL para zero-fill. Mais SQL para
  testar; o zero-fill em JS é trivial e mantém a query simples. *Também rejeitado:*
  devolver só os meses com dados e delegar o preenchimento ao web — deixaria o
  contrato ambíguo.

### D7 — Espaço: `storage_used_bytes` como fonte, capacidade derivada por nº de pessoas
- `usedBytes` = `SUM(users.storage_used_bytes)` no alcance (fonte canônica da
  cota, reconciliada pelo `storage-events` — mesma base que bloqueia o upload).
- `quotaBytesPerUser` = `config.storageQuotaBytesPerUser`.
- `userCount` = nº de pessoas no alcance.
- Derivados: `capacityBytes = quotaBytesPerUser × userCount`, `availableBytes =
  max(0, capacityBytes − usedBytes)`. O gráfico "utilizado vs. disponível" usa
  `usedBytes` vs. `availableBytes`.
- *Alternativa rejeitada:* somar `files.size_bytes` dos ativos. Divergiria do
  contador que efetivamente barra o upload (a cota é por `storage_used_bytes`);
  o painel deve exibir o **mesmo** número que a regra de bloqueio usa.

### D8 — Sem migração; índice só se o `EXPLAIN` pedir
Os agregados varrem `files`/`users` já filtrados pela RLS (`files_unit_id_idx`,
`users_unit_id_idx` existem). Na escala do MVP, o full scan por unidade é
aceitável. Mede-se com `EXPLAIN`; um índice (ex.: `files (unit_id, created_at)
WHERE deleted_at IS NULL AND status='active'`) só entra se compensar — como
migração **aditiva**, nunca editando uma aplicada (mesma postura do Épico 7).

### D9 — Cartões derivam dos mesmos agregados, sem query redundante
`cards` (total de arquivos ativos, total de pessoas, espaço utilizado, % da cota)
reaproveita os números já computados para os outros blocos (`filesByType`
somado, `storage`), evitando recontar. `%` da cota = `usedBytes / capacityBytes`
(0 quando `capacityBytes = 0`, i.e. nenhuma pessoa no alcance).

## Risks / Trade-offs

- **Agregação ao vivo em volume grande** → na escala do MVP as varreduras por
  unidade são baratas; D8 deixa o gatilho de índice/cache medido, não presumido.
  Cache/materialização é Non-Goal explícito até o volume exigir.
- **`storage_used_bytes` depende da reconciliação do `storage-events`** → se a
  reconciliação atrasar, `usedBytes` reflete o último estado reconciliado, não o
  instantâneo. É a **mesma** base que a cota usa para bloquear upload, então
  painel e bloqueio ficam consistentes entre si (trade-off aceito: coerência com
  a regra de cota vale mais que exatidão ao segundo).
- **`global_admin` e "espaço disponível"** → capacidade global = cota × total de
  pessoas de todas as unidades; é a leitura literal de "alcance global" da US 8.2.
- **Categorias fixas do PRD** → um MIME novo cai em `other`; a lista de
  categorias segue exatamente as opções que o PRD nomeia, e é o helper único que
  a US 9.1 vai reusar — evoluir a lista é mudança de um só ponto.

## Migration Plan

Sem migração de banco (D8, salvo índice aditivo opcional). Deploy é aditivo: nova
rota `GET /dashboard` e novos exports em `packages/shared` (rebuild). Nenhuma rota
existente muda de contrato; rollback é remover a rota/exports. Sem passo de infra
nem de paridade dev.

## Open Questions

- **Conjunto exato dos cartões**: a US 8.2 diz "estatísticas principais" sem
  enumerá-las. Assume-se {total de arquivos ativos, total de pessoas, espaço
  utilizado, % da cota} (D9); ajustável quando o `apps/web` desenhar o painel,
  sem mudar o contrato dos três gráficos.
- **Janela de "envios por mês"**: assume-se 12 meses (D6); parametrizar o
  intervalo é Non-Goal desta fatia.
