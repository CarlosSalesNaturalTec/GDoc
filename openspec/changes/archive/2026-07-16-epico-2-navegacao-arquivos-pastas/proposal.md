# Proposal — epico-2-navegacao-arquivos-pastas

## Why

O Épico 1 (`epico-1-auth-e-pessoas`, arquivado) entregou identidade real — login,
sessão e CRUD de pessoas —, mas o produto ainda não tem uma **árvore**: a tabela
`files` é plana (`object_path`, `owner_id`, `unit_id`, `status`), não existe
conceito de pasta, nem navegação, nem trilha (breadcrumb). Sem esse esqueleto não
há **alvo** para as épicas seguintes: permissões (Épico 4) concedem acesso "sobre
uma pasta ou arquivos selecionados", a lixeira (Épico 6) exclui pastas/arquivos, e
o envio/download em lote (Épico 3) recria hierarquia — todos precisam que pastas e
navegação existam primeiro.

O Épico 2 do PRD (`docs/prd_final.md`, US 2.1 e US 2.2) entrega esse esqueleto —
**somente backend/API**. A regra de visibilidade da US 2.1 tem duas metades: "itens
que **criei**" e "itens que **me foram liberados**". A segunda metade depende do
motor de permissões (Épico 4), que ainda não existe. Esta mudança entrega a
visibilidade **só-por-dono** (vejo o que criei), coerente com o fatiamento já
adotado no Épico 1 (backend primeiro, resto adiado). A visibilidade por concessão
explícita e o alcance administrativo sobre itens de terceiros (US 2.1 cenário 2
completo, US 5.1) reabrem a regra no Épico 4/5.

## What Changes

- **Pastas aninhadas** (US 2.1): nova tabela `folders` (tenant-scoped, `unit_id` +
  policy RLS, `owner_id`, `parent_id` auto-referente para o aninhamento, `name`).
  `POST /folders` cria pasta na raiz ou dentro de outra pasta do próprio dono.
- **Arquivos moram em pastas** (US 2.1): `files` ganha `folder_id` (nulo = raiz da
  unidade). O `POST /files/upload-url` existente passa a aceitar `folderId` opcional.
- **Navegação com trilha** (US 2.1): `GET /folders/:id/contents` (e a raiz) lista
  subpastas e arquivos **do próprio dono**, e devolve a trilha (breadcrumb) da raiz
  até a pasta corrente, permitindo voltar a qualquer nível. O isolamento entre
  unidades continua garantido pela RLS.
- **Visibilidade só-por-dono** (US 2.1, cenário 1): a listagem filtra `owner_id =`
  usuário corrente; a RLS já restringe à unidade. Itens de outras pessoas — ainda
  que na mesma pasta — não aparecem (a concessão explícita é o Épico 4).
- **Renomear e substituir arquivo** (US 2.2): `PATCH /files/:id` renomeia; `POST
  /files/:id/replace-url` emite uma URL assinada de PUT para uma **nova versão no
  mesmo local lógico** (mesma pasta e nome), trocando o ponteiro do objeto na
  reconciliação, **sem manter a versão anterior** disponível (fora de escopo no PRD).
  A checagem de permissão é baseada em **dono** até o Épico 4.
- **Registro do evento de renomear/substituir** (US 2.2, "o evento fica
  registrado"): `audit_events` passa a aceitar as ações `rename` e `replace` além de
  `view`/`download`.
- **Nova migração `0004`** (não edita migrações aplicadas): cria `folders` com RLS,
  adiciona `files.folder_id` e estende a constraint de `audit_events.action`.

## Capabilities

### New Capabilities

- `navegacao`: modelo de pastas aninhadas por unidade, criação de pasta, listagem do
  conteúdo de uma pasta com trilha (breadcrumb) e visibilidade só-por-dono, sempre
  isolada por unidade via RLS. Cobre US 2.1 (metade "itens que criei").

- `gestao-arquivos`: renomear um arquivo e substituí-lo por uma nova versão no mesmo
  local lógico, com checagem por dono, sem histórico de versões, registrando o
  evento na auditoria. Cobre US 2.2.

### Modified Capabilities

<!-- Nenhuma. A capability platform-infrastructure e as capabilities do Épico 1
     (autenticacao, gestao-pessoas) permanecem intactas: o mecanismo de tenancy
     (SET LOCAL por transação, RLS por unit_id) e o fluxo de URLs assinadas são
     reutilizados sem alterar nenhum requisito verificável já publicado. -->

## Impact

- **Código (apps/api):** novo `routes/folders.ts` (criar/listar conteúdo + trilha);
  extensão de `routes/files.ts` (`PATCH /files/:id`, `POST /files/:id/replace-url`,
  `folderId` no upload-url); reconciliação em `routes/storage-events.ts` passa a
  tratar a troca de ponteiro do replace e o delta de cota.
- **Banco:** migração `0004_folders_and_file_placement.sql` — tabela `folders`
  (`unit_id` + `FORCE ROW LEVEL SECURITY` + policy conforme padrão), coluna
  `files.folder_id`, e ampliação da constraint `audit_events.action`.
- **Contratos (packages/shared):** DTOs de pasta, de conteúdo de pasta (subpastas +
  arquivos + trilha) e de renomear/substituir; enum de ação de auditoria ampliado.
- **Fora de escopo (mudanças futuras):** qualquer tela/SPA (`apps/web` segue
  reservado); visibilidade por concessão explícita e alcance administrativo sobre
  itens de terceiros (Épico 4/US 4.x, Épico 5/US 5.1); envio de pasta inteira e
  download compactado de pasta (Épico 3/US 3.2, US 3.3); lixeira e `deleted_at`
  (Épico 6); busca e filtros (Épico 9); histórico de versões navegável (fora do MVP).
