## Context

Fatia 6 do roadmap do frontend (`docs/frontend_roadmap.md`). O backend do
Épico 4 (US 4.1) já está entregue e arquivado — spec `permissoes-granulares`,
rota `apps/api/src/routes/grants.ts`. O contrato é fixo e não muda nesta fatia:

- `POST /grants` — body `{subjectUserId, resourceType, resourceId,
  permissions: Permission[]}` → `GrantListResponse`. Admin-only (403 p/
  colaborador). Idempotente (`ON CONFLICT (unit_id, subject_user_id,
  resource_type, resource_id, permission) DO NOTHING`). Recurso/pessoa
  inexistente ou de outra unidade → 404 sem vazar existência (RLS).
- `GET /grants?resourceType=&resourceId=` → `GrantListResponse`. Admin-only.
  **Sempre por um recurso específico** — ambos os parâmetros são obrigatórios;
  não há listagem global de concessões.
- `DELETE /grants/:id` → 204. Admin-only. Remove **uma** linha (um verbo); RLS
  filtra grants de outra unidade (0 linhas → 404).

Enums de `@gdoc/shared`: `Permission` = `view·download·upload·rename·delete`;
`GrantResourceType` = `folder·file`. `GrantResponse` traz **um** verbo por linha
(`permission`) e só o `subjectUserId` (UUID) — o nome vem de outra fonte.

Peças de frontend já existentes e reusáveis (Fatias 1–5):
`useSession().role` (guarda por papel), `apiClient`, `ExplorerPage` com coluna
de ações (`Space`/`Button`/`Popconfirm`), o hook admin-only sobre `GET /users`
introduzido na busca (`busca/queries.ts::useAuthorOptions`) e seu schema Zod de
lista de pessoas, `renderApp` + `mock-fetch` dos testes.

## Goals / Non-Goals

**Goals:**
- Dar ao administrador um caminho pela SPA para conceder/revogar verbos por
  pessoa sobre um item (pasta ou arquivo), cobrindo o frontend da US 4.1.
- Reusar o contrato e as convenções existentes sem tocar em `apps/api` nem
  `packages/shared`.
- Refletir na UI a não-herança (invariante de segurança do servidor) para não
  induzir o admin a erro sobre o alcance de uma concessão em pasta.

**Non-Goals:**
- Expiração de concessão (backend não suporta — lacuna conhecida).
- Concessão em lote sobre múltiplos itens selecionados (por-item nesta fatia).
- Concessão a grupo (fatia futura de backend).
- Tela centralizada de "todas as concessões" (o endpoint é por recurso).

## Decisions

### D1 — Ponto de entrada: ação por-linha no explorador, não uma página nova
`GET /grants` é sempre por recurso, então não há tela global a construir. A
gestão nasce **de um item**: uma ação "Permissões" (ícone de cadeado) na coluna
de ações do `ExplorerPage`, ao lado de renomear/excluir, que abre o
`PermissoesModal` para aquela linha. Alternativa considerada — rota `/permissoes`
dedicada — rejeitada: não há endpoint que a alimente sem um recurso, e duplicaria
a navegação que o explorador já dá. Consequência: a fatia depende do explorador
(Fatia 2), coerente com o grafo do roadmap.

### D2 — Guarda por papel na UI espelha o admin-only do backend
A ação "Permissões" só é renderizada para `unit_admin`/`global_admin`
(`useSession().role`), e o hook que popula o `Select` de pessoa usa
`enabled: role===ADMIN` (mesmo padrão da Fatia 5) — o colaborador **nunca**
dispara `GET /users` nem vê a ação, evitando 403 desnecessário. A UI não é linha
de defesa: se a guarda falhasse, o servidor ainda barra por papel + RLS. Não
reimplementamos a lista de pessoas — **importamos diretamente** o hook/schema da
`busca/` e o consumimos como está, sem mover nem criar módulo comum (evita
refactor cross-feature nesta fatia; a extração para um ponto compartilhado, se
um dia valer, fica como decisão sua futura).

### D3 — Uma chamada `POST /grants` por concessão, verbos como `Checkbox.Group`
O formulário coleta uma pessoa (`Select`) e N verbos (`Checkbox.Group`) e envia
**um** `POST /grants` com `permissions` = verbos marcados. Aproveita o suporte
nativo do backend a múltiplos verbos numa operação (US 4.1 cenário 3) e sua
idempotência (cenário "reconceder"), então a UI não precisa pré-checar
duplicatas nem tratar conflito como erro. Mutation TanStack Query
`useCreateGrant` invalida a query `useGrants(resourceType, resourceId)` no
sucesso → os vigentes recarregam sem polling.

### D4 — Vigentes agrupados por pessoa; revogação por verbo com id da linha
`GET /grants` devolve uma linha por (pessoa, verbo). O modal agrupa por pessoa e
lista os verbos de cada uma, cada verbo com "Revogar" → `DELETE /grants/:id`
(o `id` da `GrantResponse`). Revogar remove só aquele verbo (o backend garante),
e `useRevokeGrant` invalida a mesma query. O nome da pessoa vem do mapa
id→nome de `GET /users` (já carregado para o `Select`); `subjectUserId` sem
correspondência (pessoa desativada, p.ex.) cai no próprio UUID como rótulo —
degradação suave, sem quebrar a lista.

### D5 — Aviso de não-herança só para pasta, como texto fixo
Ao abrir o modal de uma **pasta** (`resourceType === 'folder'`), exibe-se um
alerta textual de que a concessão vale só para a pasta e não libera o conteúdo
interno (reflexo de `access.ts`, US 4.1 cenário 2). Para arquivo, não se aplica.
É texto estático, não uma checagem — a regra real está no servidor; o aviso só
evita o erro mental do admin.

### D6 — Fronteira Zod espelhando os DTOs, sem redefinir tipos
Novos `grantResponseSchema`/`grantListResponseSchema` em `lib/schemas.ts` como
`z.ZodType<GrantResponse>`/`<GrantListResponse>`, validando a resposta na
fronteira como nas fatias anteriores. `CreateGrantRequest` é montado a partir do
enum `Permission` de `@gdoc/shared` (fonte única), sem literais soltos.

## Risks / Trade-offs

- **[Sem expiração, mas o roadmap prometeu]** → registrado como lacuna conhecida
  no proposal e a ser anotado em `docs/frontend_roadmap.md`; nenhum controle de
  prazo é exposto (não fingir um campo que o backend ignora). Change de backend
  futura reabre o tema.
- **[Nome da pessoa depende de `GET /users`]** → se a chamada falhar, os
  vigentes ainda listam por UUID (degradação suave) e o `Select` de concessão
  fica indisponível com mensagem — a leitura não quebra por causa da escrita.
- **[N+ concessões geram várias linhas por pessoa]** → o agrupamento por pessoa
  no cliente mantém a leitura clara; volume é baixo por recurso (poucos verbos ×
  poucas pessoas), sem paginação necessária.
- **[Erro 404 "sem vazar existência" ao conceder]** → a UI trata 404 como falha
  genérica de concessão (mensagem neutra), sem distinguir "recurso não existe"
  de "de outra unidade", preservando o invariante de fail-closed do servidor.

## Open Questions

Nenhuma — as duas decisões abertas na exploração (sem expiração; por-item) já
foram fechadas pelo usuário e refletidas em D3 e nos Non-Goals.
