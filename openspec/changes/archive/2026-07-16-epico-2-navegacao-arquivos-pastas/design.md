# Design — epico-2-navegacao-arquivos-pastas

## Context

A fundação e o Épico 1 já entregam: RLS por `unit_id` com `withTenantTransaction`
(`SET LOCAL app.current_unit` / `app.user_role` por requisição), identidade real via
sessão (`attachTenantContext` popula `req.tenantContext = { userId, unitId, role }`),
e o fluxo de URLs assinadas (`StoragePort`: `getViewUrl`, `getDownloadUrl`,
`getUploadUrl`, `buildObjectPath`). Hoje:

- `files` (migração `0001`) é **plana**: `unit_id`, `owner_id`, `object_path UNIQUE`,
  `file_name`, `content_type`, `size_bytes`, `status`. Não há `folder_id`.
- Não existe tabela de pastas — logo, não há hierarquia nem trilha.
- `audit_events.action` só aceita `view` / `download` (CHECK).
- `POST /files/upload-url` já pré-checa a cota de 10 GB e insere a linha `pending`;
  `POST /internal/storage-events` reconcilia (`storage_used_bytes`, status).

Restrições de arquitetura (herdadas, não renegociadas): backend é o único guardião
de permissão; toda tabela tenant-scoped mantém `unit_id` + policy RLS; nunca `SET`
de sessão (pooler em modo transação); bytes trafegam por URL assinada de TTL curto
emitida só após checagem no servidor; bucket 100% privado.

## Goals / Non-Goals

**Goals:**

- Modelo de pastas aninhadas por unidade, sob RLS, com dono e auto-referência.
- Colocação de arquivos em pastas (`folder_id`, nulo = raiz da unidade).
- Listar o conteúdo de uma pasta (subpastas + arquivos) **do próprio dono** e a
  trilha (breadcrumb) da raiz até ela.
- Renomear e substituir arquivo por nova versão no mesmo local lógico, sem versão
  anterior, com o evento registrado na auditoria.
- Preservar intactos o mecanismo de tenancy, o fluxo de URLs assinadas e a cota.

**Non-Goals:**

- Qualquer UI/SPA (`apps/web` segue reservado).
- Visibilidade por concessão explícita ("me foram liberados") e alcance
  administrativo sobre itens de terceiros — Épico 4 (permissões) e Épico 5 (US 5.1).
- Envio de pasta inteira e download compactado de pasta — Épico 3 (US 3.2, US 3.3).
- Lixeira, `deleted_at` e restauração — Épico 6.
- Busca e filtros — Épico 9. Histórico de versões navegável — fora do MVP.

## Decisions

### D1 — Tabela `folders`: aninhada, tenant-scoped, sob RLS, com dono

Nova tabela na migração `0004`:

```
folders (
  id         uuid PK default gen_random_uuid(),
  unit_id    uuid NOT NULL REFERENCES units(id),
  owner_id   uuid NOT NULL REFERENCES users(id),
  parent_id  uuid REFERENCES folders(id),   -- NULL = pasta na raiz da unidade
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

`FORCE ROW LEVEL SECURITY` + a **mesma** policy das demais tabelas tenant-scoped
(`unit_id = current_setting('app.current_unit')::uuid OR
current_setting('app.user_role') = 'global_admin'`), coerente com
`0002_enable_rls.sql`. Índice em `(unit_id, parent_id)` para listar conteúdo, e em
`(owner_id)` para o filtro por dono.

Por quê `parent_id` auto-referente e não `path`/`materialized path`: a navegação do
MVP é sempre "um nível por vez" (US 2.1 — entro numa subpasta, a trilha atualiza),
então a listagem é um `WHERE parent_id = $1` e a trilha é um walk curto pela cadeia
de pais. `ltree`/materialized path otimizaria subárvores inteiras, que só interessam
ao Épico 3 (envio/download recursivo) — decisão adiada para lá, sem bloquear aqui.

**Sem `deleted_at`**: exclusão e lixeira são o Épico 6. Aqui pastas não são
excluídas.

### D2 — `files.folder_id` nulo = raiz da unidade

`ALTER TABLE files ADD COLUMN folder_id uuid REFERENCES folders(id)`. Nulo é a raiz
da unidade (arquivos criados antes desta mudança e uploads sem `folderId`
permanecem válidos na raiz — mudança aditiva, sem backfill destrutivo). `object_path`
segue `UNIQUE` e continua sendo o endereço físico no bucket; `folder_id` é o local
**lógico**. Um índice `(unit_id, folder_id)` acompanha a listagem.

Por quê não amarrar `folder_id NOT NULL` com uma "pasta raiz" real: a raiz como
linha exigiria semear uma pasta por unidade e complicaria o Épico 1 já arquivado.
Nulo-é-raiz é mais simples e o contrato de listagem trata a raiz como um caso
explícito (`GET /folders/root/contents`).

### D3 — Visibilidade só-por-dono nesta fatia

A listagem de conteúdo filtra `owner_id = ctx.userId` (subpastas e arquivos), e a
RLS já restringe à unidade. Assim, US 2.1 cenário 1 (navegar e ver a trilha) e a
**metade "itens que criei"** do cenário 2 ficam verificáveis já. A metade "itens que
me foram liberados" e o alcance de `unit_admin`/`global_admin` sobre itens de
terceiros dependem da tabela de permissões (Épico 4) e do alcance administrativo
(Épico 5) — esta mudança **não** os implementa, para não antecipar o motor de
permissões antes de existirem alvos e concessões.

Consequência assumida e documentada: nesta fatia, mesmo um administrador só enxerga,
na navegação, os itens que ele próprio criou. O alcance ampliado do admin é reaberto
no Épico 4/5. Isso é coerente com "backend primeiro, resto adiado" do Épico 1.

### D4 — Criação de pasta e integridade da árvore

`POST /folders { name, parentId? }`:

- Se `parentId` vier, a pasta-pai é lida sob `withTenantTransaction` — a RLS garante
  mesma unidade; a aplicação exige `parent.owner_id = ctx.userId` (dono cria dentro
  da própria árvore). Pai inexistente/de outra unidade → `404`/`403` sem vazar.
- A nova pasta herda `unit_id = ctx.unitId` e `owner_id = ctx.userId`; `parent_id`
  nulo cria na raiz.
- Ciclos são impossíveis por construção: o pai já existe e é sempre ancestral; a
  criação nunca reaponta um nó para um descendente. (Mover/reparentar pasta não está
  no escopo desta fatia — quando entrar, exigirá checagem anti-ciclo explícita.)

### D5 — Trilha (breadcrumb) por walk da cadeia de pais

`GET /folders/:id/contents` devolve `{ folder, breadcrumb, folders, files }`, onde
`breadcrumb` é a lista `[raiz … pasta corrente]` obtida subindo `parent_id` a partir
da pasta atual, tudo sob a mesma transação tenant (RLS) e filtrado por dono. A raiz
é atendida por `GET /folders/root/contents` (breadcrumb vazio, `parent_id IS NULL`).

Por quê montar a trilha no servidor: a navegação e a permissão são responsabilidade
do backend (RNF de Segurança); o cliente não deve inferir hierarquia por conta
própria. O walk é curto (profundidade de navegação humana) e roda numa transação só.

### D6 — Renomear e substituir arquivo (US 2.2)

- **Renomear** — `PATCH /files/:id { fileName }`: atualiza `file_name` sob transação
  tenant; permitido se `owner_id = ctx.userId` (checagem por dono até o Épico 4).
  `object_path` não muda (o nome no bucket é irrelevante para o usuário). Sem
  permissão/arquivo não visível → `403`.
- **Substituir** — `POST /files/:id/replace-url { contentType, declaredSizeBytes }`:
  pré-checa a cota pelo **delta** (`usoAtual − tamanhoAntigo + tamanhoNovo ≤ 10 GB`),
  gera uma URL assinada de PUT para um **novo `object_path`** (novo uuid, mesmo
  prefixo por unidade/dono) e devolve esse novo path. O ponteiro vivo `object_path`
  **não muda na emissão** — o path novo é guardado em `pending_object_path` (migração
  `0005`) e a linha entra em `status = 'replacing'`. O local **lógico** (`folder_id`,
  `file_name`) é preservado — "mesmo local" no sentido do PRD. A reconciliação
  (`POST /internal/storage-events`) localiza a linha pelo path finalizado (que numa
  substituição é o `pending_object_path`), **só então** promove `object_path ←
  pending_object_path`, limpa o pendente e ajusta `storage_used_bytes` pelo delta; o
  objeto antigo fica órfão (limpeza física é responsabilidade de rotina/Épico 6, não
  bloqueia a substituição).

Por quê novo `object_path` em vez de sobrescrever o mesmo objeto: evita a
complexidade de PUT idempotente sobre um path já assinado e mantém `object_path
UNIQUE`; "sem versão anterior" (fora de escopo no PRD) é respeitado porque o ponteiro
só aponta para uma versão por vez e a antiga não é indexada nem consultável.

Por quê promover o ponteiro só no finalize (e não na emissão da URL): se o upload
da nova versão for **abandonado** (URL emitida, PUT nunca concluído), o `object_path`
vivo continua apontando para a versão vigente e o arquivo permanece íntegro e
consultável — nada de dados perdidos. A cota também não é tocada até o finalize.

### D7 — Evento de renomear/substituir na auditoria

A US 2.2 exige "o evento fica registrado". A migração `0004` amplia a constraint de
`audit_events.action` para `('view','download','rename','replace')`, e as rotas de
renomear/substituir gravam a linha correspondente (mesmo padrão de `recordAudit` já
usado em `files.ts`). A consulta desses eventos é o Épico 7; aqui apenas gravamos.

Por quê reusar `audit_events` e não uma tabela nova: o registro pedido pela US 2.2 é
da mesma natureza (quem/qual arquivo/quando/qual ação) já modelada; ampliar o CHECK é
aditivo e mantém a auditoria num só lugar para o Épico 7 consumir.

## Risks / Trade-offs

- **Admin não enxerga itens de terceiros na navegação (D3)** → aceito e documentado:
  é o recorte "só-por-dono". O alcance administrativo é reaberto no Épico 4/5, antes
  de a navegação ir para produção com múltiplos papéis.
- **Objeto órfão no bucket após substituir (D6)** → mitigação: a limpeza física é de
  rotina (alinhável ao expurgo diário do Épico 6); a cota é ajustada pelo delta, então
  o usuário não é cobrado pelo objeto antigo. Registrar como pendência antes de dados
  reais em prod. Substituição **abandonada** (URL emitida sem finalize) não gera nem
  órfão físico (nada foi enviado) nem perda: o `object_path` vivo nunca é movido antes
  do finalize (D6).
- **Reconciliação do replace depende do endpoint sem OIDC** (gap conhecido e
  documentado de `storage-events`) → não é regressão desta mudança; a troca de
  ponteiro herda o mesmo modelo de confiança já em uso e será endurecida junto com o
  fechamento daquele gap.
- **Cota do replace por delta** → cuidado para não contar em dobro: o pré-check usa o
  delta e a reconciliação também; a linha `pending` da substituição não deve somar até
  o finalize, espelhando o fluxo de upload atual.

## Migration Plan

1. Migração `0004_folders_and_file_placement.sql`: cria `folders` (+ RLS/policy +
   índices), adiciona `files.folder_id` (+ índice), amplia o CHECK de
   `audit_events.action`. Rodar `npm run migrate`. Não edita migração aplicada.
2. Contratos em `packages/shared` (DTOs de pasta/conteúdo/trilha, renomear/substituir,
   enum de ação ampliado) e `npm run build --workspace packages/shared`.
3. `routes/folders.ts` (criar, listar conteúdo raiz e de pasta com trilha) montado em
   `app.ts` atrás de `attachTenantContext`.
4. `routes/files.ts`: `folderId` opcional no upload-url; `PATCH /files/:id`;
   `POST /files/:id/replace-url`. Auditar `rename`/`replace`.
5. `routes/storage-events.ts`: tratar a troca de ponteiro e o delta de cota do replace.
6. Testes: RLS de `folders` (unidade A não vê pasta da B), visibilidade só-por-dono na
   listagem, trilha correta, renomear/substituir por dono vs. não-dono, cota por delta.

**Rollback:** a migração `0004` é aditiva (tabela nova + coluna nullable + CHECK
ampliado); reverter é redeploy da imagem anterior. Nenhum dado é destruído.

## Open Questions

- Limite de profundidade/tamanho de nome de pasta (proposta: sem limite rígido de
  profundidade; `name` validado por comprimento) — decidir na implementação, não
  bloqueia o design.
- Ordenação padrão da listagem (pastas antes de arquivos, por nome) — detalhe de
  contrato, sem impacto em spec.
