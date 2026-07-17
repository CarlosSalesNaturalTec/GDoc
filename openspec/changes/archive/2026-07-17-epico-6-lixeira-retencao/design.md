## Context

O GDoc já tem exclusão de acesso (permissões), mas **não tem exclusão de
conteúdo**: não existe rota para remover um arquivo ou pasta. O verbo `delete`
está declarado em `Permission` (`packages/shared/src/permissions.ts`) e no
`CHECK` de `grants` (`0007_grants.sql`), porém sem consumidor — o Épico 4
deixou-o pronto justamente para a Lixeira (Épico 6).

Estado atual relevante:

- **`files`** (`0001` + `0004`): `status` ∈ `pending|active|over_quota|replacing`
  rastreia o **ciclo de upload/substituição**, não exclusão. Sem coluna de
  exclusão. RLS por `unit_id` ativa. `object_path UNIQUE` aponta os bytes vivos.
- **`folders`** (`0004`): árvore por `parent_id` (nulo = raiz), RLS por
  `unit_id`. Sem coluna de exclusão.
- **`grants`** (`0007`): `(subject_user_id, resource_type, resource_id,
  permission)`; `resource_id` é **polimórfico** (folder|file), **sem FK real**.
- **`audit_events`** (`0001` + `0004`): `file_id uuid NOT NULL REFERENCES
  files(id)`, `action ∈ view|download|rename|replace`. **Sem `ON DELETE`** → uma
  exclusão física de `files` com auditoria referente **falha por FK**.
- **`lib/access.ts`**: ponto único de resolução — `hasAccess()` (dono OU admin
  da unidade OU grant do verbo) e `visibleResourceClause()` (fragmento de
  listagem). Nenhum filtra exclusão hoje.
- **`StoragePort`** (`ports/storage-port.ts`): só assina URLs
  (view/download/upload); **não remove objetos**.
- **`storage_used_bytes`** em `users`: cota de 10 GB, incrementada na
  reconciliação pós-upload (`routes/storage-events.ts`), decrementada em lugar
  nenhum ainda.
- **Infra**: `scheduler.tf` já tem Cloud Scheduler → Cloud Run Job diário às
  03:00 (`trash_purge_example`, imagem placeholder). Padrão de "job" em dev é
  script `tsx` executado por `npm run` (ver `migrate.ts`/`seed.ts`).

Restrições herdadas e não renegociadas (config.yaml + CLAUDE.md): RLS é a
fronteira dura de isolamento (nunca só a app); `SET LOCAL` por transação;
migração aplicada não é editada — sempre novo arquivo; toda tabela com dado de
unidade tem `unit_id` + RLS.

## Goals / Non-Goals

**Goals:**

- Excluir arquivo e pasta de forma **reversível** (soft-delete), com a pasta
  cascateando para o conteúdo interno, resolvido pela regra de acesso já
  existente (verbo `delete`).
- Restaurar ao **local de origem com as permissões preservadas** (US 6.1
  cenário 1), sem mover linhas nem recriar grants.
- Fazer o item na lixeira **desaparecer de toda visão viva** (navegação,
  view/download, rename, link direto), fail-closed e sem vazar existência.
- **Expurgo permanente automático** dos itens com >30 dias na lixeira,
  removendo bytes, devolvendo cota e apagando linhas — disparado diariamente às
  3h em prod (Cloud Run Job) e executável à mão em dev (`npm run`).
- Zero acoplamento a SDK de nuvem na lógica: exclusão de bytes atrás do novo
  `StoragePort.deleteObject`; paridade dev via `fake-gcs-server`.

**Non-Goals:**

- **Exclusão permanente imediata / "esvaziar lixeira"** pelo usuário (liberar
  cota antes dos 30 dias) — fatia futura.
- **Escolher destino ao restaurar** um item cujo ancestral foi expurgado —
  nesta fatia só raízes de exclusão são restauráveis (D5).
- **Reter auditoria após o expurgo** do arquivo — apagada junto (D7/D10);
  decisão do Épico 7.
- **UI/SPA** da lixeira, **consulta de auditoria** (Épico 7), **painel de cota**
  (Épico 8), **busca** (Épico 9), **avisos de expiração** (Épico 4 Fatia B).

## Decisions

### D1 — Soft-delete por colunas (`deleted_at`/`deleted_by`), não por `status`

Nova migração aditiva em `files` e `folders`:

```
ALTER TABLE files   ADD COLUMN deleted_at  timestamptz,
                    ADD COLUMN deleted_by  uuid REFERENCES users(id),
                    ADD COLUMN trash_root_id uuid;   -- agrupador da operação (D4)
ALTER TABLE folders ADD COLUMN deleted_at  timestamptz,
                    ADD COLUMN deleted_by  uuid REFERENCES users(id),
                    ADD COLUMN trash_root_id uuid;
CREATE INDEX files_deleted_at_idx   ON files   (deleted_at)   WHERE deleted_at IS NOT NULL;
CREATE INDEX folders_deleted_at_idx ON folders (deleted_at)   WHERE deleted_at IS NOT NULL;
```

`deleted_at IS NULL` = vivo. **Por que não um valor de `status`?** `status`
modela o ciclo de upload (`pending → active`, `replacing`); um arquivo pode
estar `active` e excluído ao mesmo tempo, e ao restaurar precisa voltar ao
`status` que tinha. Exclusão é uma dimensão ortogonal — coluna própria evita
colapsar dois conceitos num só enum e não exige tocar a máquina de
reconciliação de upload. _Alternativa descartada:_ `status = 'trashed'` —
perderia o `status` original e conflitaria com `replacing`.

RLS: as colunas ficam em tabelas **já** protegidas por RLS de `unit_id`
(`0002`/`0004`); nenhuma tabela nova, nada a acrescentar na policy. `deleted_by`
referencia `users(id)` (auditabilidade de quem excluiu).

### D2 — Item na lixeira some de toda visão viva, num só lugar

O filtro `deleted_at IS NULL` entra nos **pontos centrais** que já mediam
acesso, para não espalhar a regra:

- `hasAccess`: o `SELECT ... WHERE id = $1` ganha `AND deleted_at IS NULL` →
  arquivo/pasta excluído resolve como inexistente (fail-closed) — não emite
  view/download-url, não renomeia/substitui, e o link direto devolve o mesmo
  `403` sem vazar existência (US 4.2 já estabeleceu esse contrato).
- `visibleResourceClause` e as queries de `listContents`: acrescentam
  `deleted_at IS NULL` → item excluído não aparece na navegação nem para o
  admin da unidade.
- `findFolderById`/buscas de recurso: idem, para breadcrumb e validação de
  âncora de upload não enxergarem pasta excluída.

Assim, a Lixeira é uma **visão à parte** (D9): as rotas vivas nunca mostram
excluídos; só `GET /trash` e as rotas de `restore` operam sobre
`deleted_at IS NOT NULL`.

### D3 — Rotas de exclusão pelo verbo `delete` já existente

`DELETE /files/:id` e `DELETE /folders/:id` reusam `hasAccess(ctx, tipo, id,
Permission.DELETE)` — ou seja, **dono OU grant `delete` OU admin da unidade**
(ramo do Épico 5, sem mudança). Sem posse/grant/alcance ⇒ `403` fail-closed,
idêntico às demais rotas de conteúdo. Excluir marca `deleted_at = now()`,
`deleted_by = ctx.userId`. O verbo já está no `CHECK` de `grants` e no enum
`Permission`; **nenhuma** mudança de schema de grants é necessária. Fecha a
ponta solta "verbo `delete` sem consumidor".

### D4 — Excluir pasta cascateia (soft) agrupado por `trash_root_id`

Excluir uma pasta soft-deleta **a pasta e toda a sua subárvore** (subpastas +
arquivos), na mesma transação tenant, com o **mesmo `deleted_at`** e
`trash_root_id = <id da pasta excluída>` em todas as linhas afetadas; um arquivo
avulso excluído recebe `trash_root_id = <próprio id>`. A varredura da subárvore
é um walk recursivo por `parent_id`/`folder_id` sob a transação (RLS mantém tudo
na unidade). **Por que agrupar?** Para restaurar a subárvore inteira de volta
como uma unidade (D5) e para a lixeira listar **raízes** de exclusão, não cada
descendente solto (D9). _Alternativa descartada:_ marcar só a pasta e inferir
descendentes na hora de restaurar — frágil se um descendente já estava excluído
antes, isoladamente; o `trash_root_id` torna a operação explícita e idempotente.

Regra de exclusão de descendente já excluído: linhas com `deleted_at IS NOT
NULL` são ignoradas pela cascata (não têm o `trash_root_id` sobrescrito),
preservando o agrupamento da exclusão anterior.

### D5 — Restaurar = limpar a marcação; só raízes de exclusão

`POST /files/:id/restore` e `POST /folders/:id/restore` exigem o mesmo alcance
do delete (dono OU grant `delete` OU admin da unidade) sobre a **raiz** de
exclusão. Restaurar limpa `deleted_at`/`deleted_by`/`trash_root_id`:

- **Arquivo avulso**: volta ao seu `folder_id` original (nunca alterado) com os
  grants intactos (nunca apagados) — "local de origem com as permissões que
  possuía" sai de graça, sem lógica de movimentação.
- **Pasta**: restaura todas as linhas com aquele `trash_root_id` que ainda estão
  na lixeira → subárvore volta inteira.

Só **raízes** (`trash_root_id = id`) são restauráveis individualmente; um
descendente sob uma raiz de pasta é restaurado ao restaurar a raiz.
**Edge case — ancestral do arquivo foi expurgado** (a pasta-pai já saiu no
expurgo enquanto o arquivo, excluído depois, ainda estava no prazo): o
`folder_id` apontaria para pasta inexistente. Mitigação simples e segura:
restaurar **para a raiz da unidade** (`folder_id = NULL`) quando o pai não
existe mais como pasta viva, informado na resposta. Escolha de destino
customizada é Non-Goal.

### D6 — Cota conta bytes na lixeira; só o expurgo devolve

`storage_used_bytes` **não** é decrementado ao excluir — os bytes seguem no
bucket durante a retenção, então continuam contando contra os 10 GB. A cota só é
devolvida quando o **expurgo** remove o objeto de fato (D7). É a contabilidade
honesta: espaço ocupado é espaço cobrado. _Alternativa descartada:_ decrementar
na exclusão — deixaria o usuário "liberar" cota enquanto os bytes ainda custam
armazenamento por até 30 dias, e exigiria re-somar (e talvez estourar a cota) na
restauração. **Tensão com US 8.1** ("liberar espaço"): com este modelo, excluir
não libera imediatamente; a liberação vem do expurgo no vencimento. A exclusão
permanente imediata para liberar já (Non-Goal) é a extensão natural se a UX
exigir — registrada em Open Questions.

### D7 — Expurgo: job standalone, tolerante a falha, bytes antes de linhas

`apps/api/src/jobs/purge-trash.ts`, executável por `npm run purge:trash` (tsx em
dev, `node dist/jobs/purge-trash.js` em prod), mesmo padrão de `migrate.ts`.
Roda **cross-unit** sob contexto de sistema (`withSystemBypass`/`global_admin`)
— é manutenção, não requisição de usuário. Corte: `deleted_at < now() -
TRASH_RETENTION_DAYS` (default 30, via `config.ts`).

Ordem por item (arquivo), **idempotente e tolerante a falha**:

```
para cada arquivo vencido:
  1. StoragePort.deleteObject(object_path)   -- remove bytes (novo método)
     (deleta também pending_object_path se houver objeto órfão de replace)
  2. UPDATE users SET storage_used_bytes -= size_bytes   -- devolve cota (D6)
  3. DELETE FROM audit_events WHERE file_id = <id>       -- (D10) evita FK
  4. DELETE FROM grants WHERE resource_type='file' AND resource_id=<id>
  5. DELETE FROM files WHERE id = <id>
  se qualquer passo falhar: loga, NÃO aborta o lote; o item reentra amanhã
depois dos arquivos: pastas vencidas (folhas primeiro) →
  DELETE grants(resource_type='folder'), DELETE folders
```

**Bytes antes de linhas**: se a exclusão do objeto falhar, a linha permanece e o
item reaparece no próximo ciclo (nunca fica uma linha órfã apontando bytes vivos
nem um objeto órfão sem linha). Se a linha some mas o objeto ficou, é lixo
detectável por reconciliação futura — preferível a perder o ponteiro antes de
apagar os bytes. Pastas por último (folhas → raiz) respeitando o FK
`parent_id`. _Alternativa descartada:_ expurgo como endpoint HTTP interno (tipo
`storage-events`) — o Terraform já modela um **Cloud Run Job** (não um push
HTTP), então o job standalone é a paridade correta; e manutenção não deve
depender do serviço web estar de pé.

### D8 — `StoragePort.deleteObject(objectPath)`

Novo método no seam:

```
/** Remove o objeto do bucket. Idempotente: objeto ausente não é erro. */
deleteObject(objectPath: string): Promise<void>;
```

Implementado no `GcsStoragePort` (real `bucket.file(path).delete({
ignoreNotFound: true })`) e no `InMemoryStoragePort` de teste. Idempotência
(ignorar ausência) é o que torna o expurgo seguro para reentrar após falha
parcial. Mantém a regra de tráfego de bytes intacta — este método **não** assina
URL nem expõe bytes; só remove, no contexto do job de sistema.

### D9 — Lixeira como visão à parte: `GET /trash`

Lista as **raízes de exclusão** (`deleted_at IS NOT NULL AND trash_root_id =
id`) no alcance do solicitante: próprias (dono), com grant `delete`, ou toda a
unidade se admin (mesma regra do delete). Responde nome, tipo, quando foi
excluído e quando expira (`deleted_at + retenção`). Não pagina nesta fatia
(volume MVP). RLS garante que a lixeira nunca cruze unidade; o filtro de alcance
por cima replica a regra de conteúdo.

### D10 — Auditoria: registrar delete/restore; expurgo apaga auditoria do arquivo

Delete e restore são ações de usuário sobre um arquivo **que ainda existe** →
gravam `audit_events` (novas ações `delete`/`restore`, acrescidas ao enum
compartilhado e ao `CHECK` na nova migração, no mesmo estilo de `rename`/
`replace` do `0004`). Já o **expurgo** apaga fisicamente o arquivo; como
`audit_events.file_id` é `NOT NULL REFERENCES files(id)`, a auditoria do arquivo
é **apagada junto** no passo 3 de D7. A nova migração ajusta o FK para `ON
DELETE CASCADE` (ou o job apaga explicitamente antes — escolha de implementação;
o design fixa o comportamento: expurgar arquivo remove sua auditoria). **Tensão
com o NFR de confiabilidade da auditoria**: o NFR é sobre não *perder por
acidente* os registros, não sobre retê-los para sempre após um expurgo
intencional aos 30 dias; a trilha existe por toda a vida do arquivo — a janela
de governança relevante. Reter auditoria pós-expurgo é decisão do Épico 7
(consulta), registrada como Non-Goal.

## Risks / Trade-offs

- **[Cascata de pasta com subárvore grande numa transação]** → walk recursivo +
  `UPDATE` em massa sob uma transação tenant; volume MVP é modesto. Mitigação: um
  único `UPDATE ... WHERE` por nível ou um CTE recursivo, não N round-trips;
  índice `(unit_id, parent_id)`/`(unit_id, folder_id)` já existe.
- **[Item excluído reaparecendo por um ponto de acesso esquecido]** → o filtro
  `deleted_at IS NULL` precisa estar em **todos** os pontos vivos. Mitigação:
  centralizar em `hasAccess`/`visibleResourceClause`/`findFolderById` (poucos
  pontos) e cobrir com teste que exclui e tenta ver/baixar/renomear/listar/link
  direto.
- **[Expurgo apaga bytes mas a linha sobrevive, ou vice-versa]** → ordem
  "bytes antes de linha" + `deleteObject` idempotente + tolerância a falha por
  item tornam o job reentrante; o pior caso é lixo detectável, nunca perda de
  ponteiro sobre bytes vivos.
- **[Cota "presa" por 30 dias após exclusão (D6)]** → intencional e honesto;
  documentado. Se a UX exigir liberação imediata, a exclusão permanente já
  (Non-Goal) é a extensão, sem reabrir a contabilidade.
- **[Perda da auditoria no expurgo (D10)]** → aceito para o MVP e coerente com o
  escopo do NFR; alternativa (auditoria sobrevive ao arquivo) fica para o Épico
  7, que desenha a consulta.
- **[`global_admin` e expurgo cross-unit]** → o job roda sob bypass de sistema
  de propósito (manutenção); não é rota de usuário. Nenhuma rota **de usuário**
  ganha alcance cross-unit — o alcance de delete/restore continua travado por
  `hasAccess` (Épico 5, Opção B).

## Migration Plan

1. **Migração** nova (`00NN_trash_retention.sql`): colunas
   `deleted_at`/`deleted_by`/`trash_root_id` em `files` e `folders`; índices
   parciais de exclusão; ajuste do FK `audit_events_file_id` para `ON DELETE
   CASCADE`; ampliação do `CHECK` de `audit_events.action` para incluir
   `delete`/`restore`. Não editar migração aplicada.
2. **`packages/shared`**: `Permission` já tem `delete`; acrescentar
   `AuditAction` `delete`/`restore` e DTOs de lixeira/restore. Rebuild do shared.
3. **Acesso**: `lib/access.ts` (`hasAccess`, `visibleResourceClause`) +
   `findFolderById`/buscas ganham `deleted_at IS NULL`.
4. **Rotas**: `DELETE`/`restore` de arquivo e pasta (cascata D4), `GET /trash`.
5. **Storage**: `StoragePort.deleteObject` + GCS + InMemory.
6. **Job**: `jobs/purge-trash.ts` + script `purge:trash` + `config.TRASH_RETENTION_DAYS`.
7. **Infra**: `scheduler.tf` aponta o Cloud Run Job para a imagem da API com o
   entrypoint de expurgo (tarefa de infra, separada da paridade dev).
8. **Testes** (`__tests__`, `seedTwoUnits`/`withSystemBypass`).
9. `npm run lint && npm run build && npm run test`.
10. **Rollback**: reverter o commit desfaz rotas/job; as colunas aditivas são
    inertes se não usadas. A migração não destrói dados (só acrescenta colunas e
    troca um `ON DELETE`), então não exige downgrade de schema.

## Open Questions

- **Liberação imediata de cota (D6)**: se o cliente exigir que excluir libere
  espaço na hora, entra a exclusão permanente imediata / "esvaziar lixeira" —
  desenhar como fatia futura, não reabrir a contabilidade de cota.
- **Retenção da auditoria pós-expurgo (D10)**: fica para o Épico 7 decidir se a
  trilha sobrevive ao arquivo (exigiria `file_id` anulável + snapshot do nome).
  Nada bloqueante para esta fatia.
