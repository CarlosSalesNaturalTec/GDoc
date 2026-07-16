# Tasks — epico-2-navegacao-arquivos-pastas

Ordem por dependência: schema → contratos → navegação (pastas + trilha) →
colocação de arquivo em pasta → renomear/substituir → auditoria do evento →
testes → prova ponta a ponta. Somente backend (apps/api); nenhuma feature de
frontend. Visibilidade só-por-dono nesta fatia (concessão explícita = Épico 4).

## 1. Banco: pastas, folder_id e ação de auditoria

- [x] 1.1 Criar migração `0004_folders_and_file_placement.sql` (arquivo novo, não
      editar migrações aplicadas) com a tabela `folders` (`id`, `unit_id NOT NULL`,
      `owner_id NOT NULL`, `parent_id uuid REFERENCES folders(id)`, `name NOT NULL`,
      `created_at`)
- [x] 1.2 Aplicar `FORCE ROW LEVEL SECURITY` em `folders` e a **mesma** policy das
      demais tabelas tenant-scoped (`unit_id = current_setting('app.current_unit')
      OR user_role = 'global_admin'`), coerente com `0002_enable_rls.sql`
- [x] 1.3 Índices: `folders (unit_id, parent_id)`, `folders (owner_id)`
- [x] 1.4 `ALTER TABLE files ADD COLUMN folder_id uuid REFERENCES folders(id)` (nulo =
      raiz da unidade) e índice `files (unit_id, folder_id)`
- [x] 1.5 Ampliar a constraint de `audit_events.action` para
      `('view','download','rename','replace')`
- [x] 1.6 Rodar `npm run migrate --workspace apps/api` e conferir `schema_migrations`

## 2. Contratos (packages/shared)

- [x] 2.1 DTOs de pasta (criação `{ name, parentId? }`, pasta) e de conteúdo de pasta
      (`{ folder, breadcrumb, folders, files }`)
- [x] 2.2 DTOs de renomear (`{ fileName }`) e substituir
      (`{ contentType, declaredSizeBytes }` → URL assinada + novo `object_path`);
      `folderId?` no DTO de upload-url
- [x] 2.3 Ampliar o enum de ação de auditoria com `rename` e `replace`
- [x] 2.4 `npm run build --workspace packages/shared`

## 3. Navegação: criar pasta e listar conteúdo com trilha

- [x] 3.1 `routes/folders.ts`: `POST /folders` — cria na raiz ou dentro de pasta do
      próprio dono; valida a pasta-pai sob transação tenant (RLS = mesma unidade) e
      exige `parent.owner_id = ctx.userId`; pai inexistente/de outra unidade → 404/403
      sem vazar
- [x] 3.2 `GET /folders/root/contents` — lista subpastas e arquivos da raiz da unidade
      (`parent_id IS NULL` / `folder_id IS NULL`) filtrados por `owner_id = ctx.userId`;
      breadcrumb vazio
- [x] 3.3 `GET /folders/:id/contents` — lista subpastas e arquivos da pasta
      (`owner_id = ctx.userId`) e monta a trilha subindo a cadeia `parent_id` na mesma
      transação tenant; pasta de outra unidade → 404/403 (RLS não expõe)
- [x] 3.4 Montar `folders.ts` no `app.ts` atrás de `attachTenantContext`

## 4. Colocação de arquivo em pasta

- [x] 4.1 `POST /files/upload-url` passa a aceitar `folderId` opcional; valida que a
      pasta é da unidade do remetente (RLS) e grava `folder_id` na linha `pending`
- [x] 4.2 Sem `folderId`, o arquivo nasce com `folder_id NULL` (raiz da unidade),
      preservando o comportamento atual

## 5. Renomear e substituir arquivo (US 2.2)

- [x] 5.1 `PATCH /files/:id` — renomeia `file_name` sob transação tenant se
      `owner_id = ctx.userId`; sem permissão/arquivo não visível → 403; `object_path`
      inalterado
- [x] 5.2 `POST /files/:id/replace-url` — checa dono; pré-checa cota pelo **delta**
      (`uso − tamanhoAntigo + tamanhoNovo ≤ cota`); gera URL assinada de PUT para um
      **novo `object_path`** e devolve o novo path; preserva `folder_id`/`file_name`
- [x] 5.3 `routes/storage-events.ts`: na reconciliação do replace, trocar o ponteiro
      `object_path` para o novo objeto e ajustar `storage_used_bytes` pelo delta (sem
      contar em dobro com o pré-check); objeto antigo fica órfão (limpeza física é
      pendência de rotina/Épico 6)

## 6. Auditoria do evento (US 2.2)

- [x] 6.1 Gravar linha de auditoria `rename` no `PATCH /files/:id` e `replace` no
      finalize da substituição, reusando o padrão `recordAudit` de `files.ts`

## 7. Testes

- [x] 7.1 RLS de `folders`: usuário da unidade A não enxerga/usa pasta da unidade B
      (nem como pai, nem por id direto)
- [x] 7.2 Visibilidade só-por-dono: pasta com itens de dois donos lista só os do
      solicitante; item de terceiro não aparece
- [x] 7.3 Navegação: criar árvore, entrar em subpasta, breadcrumb correto da raiz até
      a pasta corrente; raiz com breadcrumb vazio
- [x] 7.4 Upload com `folderId` coloca o arquivo na pasta; sem `folderId` cai na raiz
- [x] 7.5 Renomear/substituir: dono consegue, não-dono recebe 403 e nada muda;
      substituir preserva local lógico e não mantém versão anterior
- [x] 7.6 Cota do replace por delta: bloqueia quando a nova versão estouraria a cota;
      não conta em dobro
- [x] 7.7 Auditoria registra `rename` e `replace`
- [x] 7.8 `npm run lint`, `npm run build`, `npm run test` verdes na raiz

## 8. Prova ponta a ponta

- [x] 8.1 Fluxo em dev: login → `POST /folders` (raiz e subpasta) → `upload-url` com
      `folderId` → `GET /folders/:id/contents` mostra o arquivo e a trilha
- [x] 8.2 Isolamento: sessão da unidade A não lista nem navega pastas/arquivos da
      unidade B, mesmo por id direto de pasta
- [x] 8.3 Substituir um arquivo pelo dono: mesmo local lógico, versão anterior
      indisponível, cota ajustada pelo delta e evento `replace` na auditoria
