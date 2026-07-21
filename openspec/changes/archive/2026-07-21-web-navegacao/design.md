## Context

A Fatia 1 (`web-shell-e-auth`, arquivada) entregou o shell da SPA e a
autenticação: roteador com guarda por auth/papel, `apiClient`
(`credentials: 'include'` + tratamento central de 401), TanStack Query,
`session-context` e schemas Zod espelhando `@gdoc/shared`. Hoje o usuário
autenticado vê o `AppShell` mas o `/` é uma `HomePage` de boas-vindas — não há
tela de conteúdo.

O backend do Épico 2 já está completo (`apps/api/src/routes/folders.ts`,
`routes/files.ts`) e é o **único guardião de permissão**: a listagem de
conteúdo já filtra por dono-ou-grant `view` sob RLS por unidade, e cada ação de
gestão revalida a permissão e responde **403 fail-closed** quando não há
alcance (sem vazar existência). Endpoints consumidos por esta fatia:

| Endpoint | Uso | DTO (`@gdoc/shared`) |
|---|---|---|
| `GET /folders/root/contents` | raiz da unidade | `FolderContentsResponse` |
| `GET /folders/:id/contents` | pasta + `breadcrumb` | `FolderContentsResponse` |
| `POST /folders` | criar subpasta | `CreateFolderRequest` → `FolderResponse` |
| `DELETE /folders/:id` | excluir pasta (cascata) | — (204) |
| `PATCH /files/:id` | renomear arquivo | `RenameFileRequest` → `FileSummaryResponse` |
| `DELETE /files/:id` | excluir arquivo | — (204) |

**Não existe `PATCH /folders/:id`** — renomear pasta não tem endpoint e fica
fora desta fatia (ver proposta e D7).

## Goals / Non-Goals

**Goals:**
- Explorador de pastas/arquivos com trilha (`Breadcrumb`) navegável — US 2.1.
- Ações de gestão por item conforme permissão: criar/excluir pasta, renomear/
  excluir arquivo — US 2.2 (exceto renomear pasta).
- Deep-link a pasta sem permissão bloqueado, sem exibir conteúdo — US 4.2.
- Reuso máximo da fundação da Fatia 1 (`apiClient`, Query, Zod, `renderApp`).

**Non-Goals:**
- Renomear pasta (sem endpoint no backend — mudança futura).
- Preview/visualização e download de bytes (Fatia 3): esta fatia **não emite
  nenhuma URL assinada** nem transfere bytes — só lista metadados e faz
  mutations de metadados. Abrir/baixar um arquivo é ação da Fatia 3.
- Upload (Fatia 4), busca (Fatia 5), permissões (Fatia 6), lixeira (Fatia 7),
  auditoria (Fatia 8).
- Qualquer mudança em `apps/api` ou `packages/shared`.

## Decisions

### D1 — Explorador em `/pastas` e `/pastas/:folderId`, `HomePage` preservada

A `HomePage` continua como landing autenticada; o explorador ganha rota própria.
`/pastas` chama `GET /folders/root/contents` (raiz da unidade, `folder: null`,
`breadcrumb: []`); `/pastas/:folderId` chama `GET /folders/:id/contents`.
Alternativa considerada — fazer `/` virar o explorador — foi descartada para não
mexer no comportamento já entregue/testado da Fatia 1 e manter o menu explícito
("Início" × "Arquivos"). Novo item "Arquivos" no `Menu` do `AppShell`, com
`selectedKeys` casando o prefixo `/pastas`.

### D2 — Uma `Table` unificando pastas e arquivos, ordenadas com pastas primeiro

O endpoint devolve `folders` e `files` separados e já ordenados (por `name` /
`file_name`). O explorador os concatena numa única `Table` (pastas antes de
arquivos), com colunas Tipo (ícone pasta/arquivo) · Nome · Tamanho · Data ·
Ações. Linha de pasta navega (`Link` para `/pastas/:id`); linha de arquivo é
inerte quanto a abrir (preview é Fatia 3). Alternativa `Tree` (árvore lateral)
foi descartada: o backend não tem herança nem carga em árvore — a navegação é
por nível, e `Table` casa melhor com a listagem plana filtrada por permissão.

### D3 — Trilha a partir de `breadcrumb` do servidor, mais o nó raiz

O `Breadcrumb` do AntD é montado com: item "Arquivos" (→ `/pastas`, a raiz da
unidade) + cada item de `FolderContentsResponse.breadcrumb` (→ `/pastas/:id`) +
a pasta corrente (`folder.name`, sem link). Clicar em qualquer nível anterior
navega direto — satisfaz US 2.1 cenário 1. Não montamos a trilha subindo
`parentId` no cliente: o servidor já entrega a cadeia correta e filtrada por
RLS, evitando N chamadas.

### D4 — Ações por item conforme permissão via fail-closed 403 (sem inferir no cliente)

`FileSummaryResponse`/`FolderResponse` trazem `ownerId` mas **não** os verbos
concedidos. Portanto o cliente **não infere permissão**: oferece as ações de
gestão e, ao receber **403** do servidor, exibe *"permissão insuficiente"*
(`message.error`), realizando o US 2.2 cenário 2. Como refinamento de UX, itens
cujo `ownerId === identity.id` são claramente próprios (todas as ações fazem
sentido); para itens liberados por grant, a tentativa-e-403 é a fonte de
verdade. Alternativa — a API devolver os verbos por item — foi descartada:
mudaria contrato/`packages/shared` (fora do escopo de uma fatia frontend) e o
padrão fail-closed do backend já cobre o cenário.

### D5 — Chave de query por pasta e invalidação após cada mutation

`useFolderContents(folderId | null)` usa a chave `['folder-contents', folderId]`
(com `folderId = 'root'` para a raiz). Toda mutation (criar pasta, renomear/
excluir arquivo, excluir pasta) invalida a chave da **pasta corrente** ao
concluir, forçando a releitura da listagem — assim a tela reflete o estado
servidor sem otimismo local. Excluir a pasta corrente (a partir de dentro dela)
navega para o pai (ou `/pastas`) antes de invalidar.

### D6 — Deep-link a pasta sem permissão → `Result status="403"`

Como o backend responde 403 (não 404) para pasta inexistente/de outra unidade/
sem `view` — fail-closed, sem vazar existência — o explorador distingue o 403 do
`GET /folders/:id/contents` (via `ApiError.status`) e renderiza um
`Result status="403"` ("Sem permissão para acessar esta pasta"), **sem** exibir
conteúdo. Realiza US 4.2 para pastas. Um 401 continua tratado centralmente
(Fatia 1) → `/login`.

### D7 — Renomear pasta fica fora; lacuna registrada

Não há `PATCH /folders/:id` no backend. A ação de renomear é oferecida **apenas
para arquivos**; pastas expõem só "Excluir". A lacuna é registrada em
`tasks.md` e em `docs/frontend_roadmap.md` como dependência de uma change de
backend futura (endpoint com dono-ou-grant `rename` + auditoria), que então
habilita a ação no frontend sem retrabalho de estrutura.

### D8 — Novos schemas Zod amarrados aos DTOs, validando a fronteira

`lib/schemas.ts` ganha `folderResponseSchema`, `fileSummaryResponseSchema` e
`folderContentsResponseSchema`, cada um tipado como `z.ZodType<T>` contra o DTO
de `@gdoc/shared` (mesmo padrão do `authenticatedIdentitySchema` da Fatia 1): se
o contrato mudar sem o schema acompanhar, o `tsc` acusa. As respostas de
listagem passam por `.parse()` antes de alimentar a `Table`.

## Risks / Trade-offs

- **Ações visíveis que falham com 403 para itens liberados** → aceitável e
  alinhado ao PRD (US 2.2 cenário 2 é justamente "ação bloqueada + aviso"); a
  mensagem de permissão insuficiente é o comportamento esperado, não um bug.
  Mitigação de ruído: esconder ações destrutivas em itens claramente não-próprios
  fica como refinamento futuro quando/se a API expuser verbos por item.
- **Renomear pasta ausente pode surpreender o usuário** → mitigado deixando a
  pasta sem a opção de renomear (não um botão que sempre falha) e documentando a
  lacuna; entra quando o backend expuser o endpoint.
- **Arquivos em status não-`active`** (`pending`/`replacing`/`over_quota`) podem
  aparecer na listagem → exibir o `status` como `Tag` e não oferecer ações que
  não façam sentido (abrir/baixar é Fatia 3); nesta fatia renomear/excluir de um
  arquivo `pending` é decisão do backend (que responde conforme permissão).
- **Excluir pasta é cascata para a lixeira** → é o comportamento do backend
  (soft-delete com retenção); o `Popconfirm` deixa claro que a pasta e seu
  conteúdo vão para a lixeira, restauráveis na Fatia 7.

## Migration Plan

Fatia puramente aditiva no frontend: novas rotas e componentes, um item de menu
e novos schemas. Sem migração de dados, sem mudança de API/contratos/infra.
Rollback = reverter o commit da fatia; a Fatia 1 permanece funcional.

## Open Questions

- Nenhuma bloqueante. A forma da ação de renomear pasta será decidida junto com
  a change de backend que criar `PATCH /folders/:id` (fora desta fatia).
