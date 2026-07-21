## Why

Com o explorador (`web-navegacao`, Fatia 2) e a visualização/download
(`web-visualizacao`, Fatia 3) já entregues, cada **visualização** e **download**
de arquivo já é **registrado** pelo backend na emissão da URL assinada — mas
**não há como consultar esse registro** pela SPA. O dono de um arquivo não
consegue acompanhar o uso do próprio material (US 7.2) e o administrador não tem
como comprovar quem acessou o quê (US 7.1) sem ir ao banco. O backend do **Épico
7 já está pronto e arquivado** (`apps/api/src/routes/audit.ts`), expondo
**`GET /files/:id/audit`** → `AuditQueryResponse` (os eventos `view`/`download`
de um arquivo, do mais recente ao mais antigo, autorizado a **dono ou
administrador da unidade**, fail-closed). Esta é a **Fatia 8**: a consulta de
auditoria de acesso na SPA, cobrindo o lado de frontend das **US 7.1** e **US
7.2** e do **RF #11**.

Como toda fatia do roadmap, esta é **frontend-pura**: consome o backend já
pronto (Épico 7 do PRD) sem tocar em `apps/api` nem em `packages/shared`.

## What Changes

- **Ação "Auditoria" por-linha de arquivo no explorador (US 7.1 / US 7.2)**: nova
  ação na coluna de ações da `ExplorerPage` (`web-navegacao`) que abre um
  **`AuditoriaModal`** do arquivo. **Só arquivos** têm auditoria — pastas não.
- **Visibilidade da ação (Opção A, `design.md` D1)**: a ação aparece quando
  **`isAdmin || file.ownerId === identity.id`** — espelhando o gate `isAdmin` já
  usado pela ação "Permissões", agora estendido ao **dono** (que a US 7.2
  autoriza). O colaborador **não** vê a ação em arquivo de que não é dono. Isso é
  **UX, não linha de defesa**: o servidor (`canReadAudit`) continua sendo o
  guardião e responde 403 de qualquer forma — a SPA nunca infere permissão como
  defesa, só evita oferecer um botão que sabidamente falharia.
- **Modal de auditoria (US 7.1 cenário 1)**: uma `Table` chama
  `GET /files/:id/audit` **uma vez ao abrir** e exibe **apenas os eventos
  retornados pelo servidor**, do mais recente ao mais antigo. Colunas: **pessoa**
  (`actor.name ?? actor.email` — o nome é opcional no DTO), **ação** (`Tag` pt-BR
  **"Visualizar"** / **"Baixar"**) e **data/hora** (`createdAt` formatado). É
  `useQuery` (não mutation): ler a auditoria é **leitura pura**, sem efeito
  colateral — a rota é um `SELECT`, não grava novo evento — e fica `enabled` só
  com o modal aberto, o mesmo padrão de `useGrants(resourceType, resourceId,
  open)` da Fatia 6.
- **Estado vazio (não é erro)**: arquivo sem nenhum acesso registrado exibe
  `Empty` "Nenhum acesso registrado" — o servidor retorna lista vazia, que a SPA
  **não** trata como falha.
- **403 fail-closed**: se a consulta retorna 403 (arquivo de outra unidade,
  inexistente, na lixeira, ou o solicitante não é dono/admin), o modal exibe um
  `Result` de **permissão insuficiente** neutro, **sem** distinguir os casos e
  **sem** vazar conteúdo — herdando o `handlePermissionError` já provado nas
  fatias anteriores.
- **Camada de dados**: novo schema Zod **`auditQueryResponseSchema`** espelhando
  `AuditQueryResponse` de `@gdoc/shared`, e hook TanStack Query
  **`useFileAudit(fileId, open)`** em `auditoria/queries.ts`, sobre o `apiClient`.
- **Testes** (Vitest + Testing Library) reusando `renderApp` + `mock-fetch` das
  fatias anteriores, um teste por cenário de spec.

### Fora de escopo (mudanças futuras)

- **Sem filtro server-side (data/pessoa/ação)**: `GET /files/:id/audit` **não**
  recebe query params — devolve os **≤500 eventos mais recentes** sem paginação
  (`AUDIT_QUERY_LIMIT`, `design.md` D6 do Épico 7). O `DatePicker.RangePicker`
  sugerido no roadmap **fica de fora** desta fatia porque só filtraria
  client-side de forma parcial (não alcança além do teto de 500). Entra quando o
  backend expuser filtro/paginação.
- **Só acessos (`view`/`download`)**: os demais eventos de `AuditAction`
  (`rename`/`replace`/`delete`/`restore`) **não** são expostos por esta consulta
  (contrato do Épico 7) — é um registro de **acesso**, não um log de atividade.
- **Sem exportação (CSV/PDF)** do registro: não há endpoint; a fatia só exibe.
- **Auditoria a partir da busca (Fatia 5) ou do `PreviewModal` (Fatia 3)**: ambos
  reusam `FileSummaryResponse` e **poderiam** ganhar a ação, mas ficam fora desta
  fatia — o roadmap escopa a Fatia 8 ao **explorador** (depende só da Fatia 2).
- **Pessoas** (Fatia 9) e **painel** (Fatia 10): cada uma é change própria.
- **Qualquer mudança em `apps/api` ou `packages/shared`**: intocados; esta fatia
  só os consome.

## Capabilities

### New Capabilities
- `web-auditoria`: a consulta de auditoria de acesso na SPA — ação "Auditoria"
  por-linha de arquivo no explorador (visível a **dono ou administrador**,
  Opção A) que abre um modal listando os eventos `view`/`download` do arquivo via
  `GET /files/:id/audit` (pessoa via `name ?? email`, ação como `Tag` pt-BR,
  data/hora), do mais recente ao mais antigo, com estado vazio (não-erro) e 403
  fail-closed neutro. Cobre o lado de frontend das **US 7.1**, **US 7.2** e do
  **RF #11**.

### Modified Capabilities
<!-- Nenhuma: a API e os contratos compartilhados não mudam de comportamento;
     esta fatia só adiciona a consulta de frontend sobre um endpoint já existente. -->

## Impact

- **Novo código** (`apps/web`): `auditoria/AuditoriaModal.tsx` (a `Table` de
  acessos, estado vazio e 403) e `auditoria/queries.ts` (`useFileAudit`); a ação
  "Auditoria" e seu estado de abertura na `navegacao/ExplorerPage.tsx`. **Sem
  rota nova** — abre do explorador, como Permissões.
- **Camada de dados** (`apps/web/src/lib/schemas.ts`): novo
  `auditQueryResponseSchema` amarrado a `AuditQueryResponse` de `@gdoc/shared`
  (`z.ZodType<T>`).
- **Reuso**: `formatDate` de `navegacao/format.ts`, o padrão
  `handlePermissionError`, o `useSession` (para `identity.id` da Opção A), o
  `apiClient`, `renderApp` + `mock-fetch` dos testes.
- **Contratos** (`packages/shared`): **sem mudança** — `AuditQueryResponse`,
  `AuditQueryEventResponse`, `AuditActorResponse` consumidos como estão.
- **API** (`apps/api`): **sem mudança** — a fatia só consome `GET /files/:id/audit`,
  já arquivado.
- **Testes** (`apps/web`, Vitest + Testing Library): dono vê os acessos do próprio
  arquivo; admin vê os acessos de arquivo da unidade; arquivo sem acessos exibe
  `Empty` (não erro); 403 exibe `Result` neutro sem vazar; ator com `name` nulo
  cai no e-mail; ação renderizada como `Tag` pt-BR; colaborador **não** vê a ação
  "Auditoria" em arquivo de que não é dono.
- **Docs**: `docs/frontend_roadmap.md` — marcar a Fatia 8 como proposta/entregue.
