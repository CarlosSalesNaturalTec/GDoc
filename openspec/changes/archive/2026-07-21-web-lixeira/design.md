## Context

As Fatias 2–6 (`web-navegacao`, `web-visualizacao`, `web-upload`, `web-busca`,
`web-permissoes`, arquivadas) entregaram o explorador (`Table`, `Breadcrumb`, o
padrão **403 fail-closed** via `handlePermissionError`, o padrão de invalidação
de `folder-contents` por mutação). O explorador **exclui** arquivos e pastas —
mas o item sumido só existe na lixeira do servidor, invisível na SPA até o
expurgo diário das 3h. Não há tela de lixeira nem restauração pelo frontend.

O backend (Épico 6, `apps/api/src/routes/trash.ts` + as rotas de restauração em
`files.ts`/`folders.ts`, arquivado) é o **único guardião de permissão** e já
expõe tudo que esta fatia precisa — nenhuma mudança de API:

| Endpoint | Uso | DTO (`@gdoc/shared`) |
|---|---|---|
| `GET /trash` | listar raízes de exclusão no alcance | `TrashListResponse` |
| `POST /files/:id/restore` | restaurar um arquivo | `FileRestoreResponse` |
| `POST /folders/:id/restore` | restaurar uma pasta | `FolderRestoreResponse` |

Contrato de `GET /trash`:

```
→ TrashListResponse { items: TrashEntryResponse[] }
  entry = { id, type: 'folder'|'file', name, deletedAt, expiresAt }   // ISO
```

Regras de governança já implementadas no servidor, que o cliente **não duplica**,
apenas respeita:

- **Só raízes de exclusão** (`trash_root_id = id`) aparecem — um descendente de
  pasta excluída volta junto ao restaurar a raiz, nunca sozinho. A SPA lista o
  que vier e não tenta restaurar descendentes.
- **Alcance**: `GET /trash` já devolve só as raízes próprias, com grant `delete`,
  ou toda a unidade se admin (`resourceScopeClause`, verbo `delete`). A SPA não
  infere quem pode restaurar; se aparece na lista, é restaurável — e o servidor
  reconfirma no restore.
- **`redirectedToRoot`** (só arquivo): se a pasta de origem não existe mais
  (ancestral expurgado ou ainda na lixeira), o arquivo volta à **raiz da
  unidade**, sinalizado na resposta (`FileRestoreResponse.redirectedToRoot`).
  Pasta **nunca** muda de local ao restaurar.
- **403 fail-closed** no restore: não-dono/sem-grant, item que deixou de ser raiz,
  inexistente ou já expurgado retornam o **mesmo 403 indistinto** — a SPA trata
  como permissão insuficiente e recarrega a lista.
- **Expurgo é do servidor**: a retenção de 30 dias e o apagamento permanente são
  a rotina diária (US 6.1 cenário 2); a SPA **não** oferece exclusão permanente.

## Goals / Non-Goals

**Goals:**
- Listar os itens na lixeira no alcance do requisitante (nome, tipo, data de
  exclusão, dias restantes) — US 6.1 (cenário 1), RF #12.
- Restaurar arquivo/pasta despachando por tipo, com aviso distinto quando um
  arquivo volta à raiz (`redirectedToRoot`) — US 6.1 (cenário 1).
- Fazer o item restaurado reaparecer no explorador sem reload (invalidação
  cruzada com `folder-contents`).
- Reuso máximo da fundação: `apiClient`, TanStack Query, Zod, `format.ts`,
  `handlePermissionError`, `renderApp`/`mock-fetch`.

**Non-Goals:**
- Esvaziar lixeira / exclusão permanente pela UI — o expurgo é só a rotina de
  servidor (US 6.1 cenário 2). Não há endpoint e esta fatia não cria um.
- Preview/download de item na lixeira — itens excluídos não são visualizáveis.
- Coluna "quem excluiu" — `TrashEntryResponse` não carrega `deleted_by`.
- Restaurar descendentes soltos — o backend só expõe raízes de exclusão.
- Qualquer mudança em `apps/api` ou `packages/shared` — só consumo.

## Decisions

### D1 — Tela própria `/lixeira`, para qualquer papel
A lixeira é **transversal à unidade** (sem âncora de pasta) e a persona da US 6.1
é o **Colaborador** — não é uma tela de administração. Decisão: **rota nova
`/lixeira`** (sob `RequireAuth`, **sem** guarda de papel) e **item "Lixeira"** no
menu do `AppShell`, visível a todos, ao lado de "Buscar". O alcance do que cada
pessoa vê é do servidor (`GET /trash` já filtra); a SPA não decide visibilidade
por papel. *Alternativa descartada:* esconder a lixeira de colaboradores —
contraria a US 6.1, cuja persona é justamente o Colaborador que se arrependeu.

### D2 — Restaurar despacha por `entry.type`
Cada item traz `type: 'folder' | 'file'` (`GrantResourceType`). A ação
"Restaurar" da linha escolhe o endpoint por esse campo: `file` →
`POST /files/:id/restore`, `folder` → `POST /folders/:id/restore`. Dois hooks de
mutação distintos (`useRestoreFile`, `useRestoreFolder`) porque as respostas
diferem (só o arquivo tem `redirectedToRoot`) e o teste de cada um é separado. O
handler da linha ramifica uma vez por `type`. *Alternativa descartada:* um único
hook "restaurar" com `if (type)` interno — esconde a diferença de resposta e
mistura dois contratos num só ponto.

### D3 — `redirectedToRoot` vira mensagem distinta (só arquivo)
No sucesso de restaurar **arquivo**, a SPA lê `redirectedToRoot`: `false` ⇒
`message.success('Arquivo restaurado ao local de origem.')`; `true` ⇒
`message.warning('A pasta de origem não existe mais; o arquivo foi restaurado na
raiz da unidade.')`. Restaurar **pasta** sempre exibe "Pasta restaurada ao local
de origem." (pasta nunca redireciona — o DTO nem tem o campo). É o caso de borda
mais fácil de perder: sem o aviso, o usuário procuraria o arquivo na pasta
antiga. *Alternativa descartada:* mensagem única "restaurado" — deixaria o
usuário sem saber onde o arquivo foi parar.

### D4 — Tag de dias restantes computada de `expiresAt`, faixas por urgência
A coluna "dias restantes" é derivada no cliente de `expiresAt`:
`dias = ceil((expiresAt - agora) / 1 dia)`. Cor do `Tag` por faixa — **≤3 dias
vermelho** (`red`), ≤7 dias laranja/aviso (`orange`), senão neutro (`default`).
É só formatação; o vencimento e o expurgo são do servidor — a SPA nunca decide
se um item ainda pode ser restaurado (o 403 do restore é a fonte da verdade). Um
item já vencido que ainda apareça na lista (janela entre listar e expurgar)
mostra 0 dias e, ao restaurar, cai no 403 fail-closed (D6). *Alternativa
descartada:* faixas de cor vindas do servidor — o backend não devolve urgência,
e a regra é puramente de apresentação.

### D5 — Invalidação cruzada com o explorador
Restaurar reintroduz o item no explorador. As mutações fazem, no `onSuccess`,
`invalidateQueries` da **chave da lixeira** (`['trash']`) **e** da chave de
listagem `['folder-contents']` (reusando `FOLDER_CONTENTS_KEY` de
`navegacao/queries.ts`) — sem otimismo local, a tela sempre reflete o que o
servidor confirmou. Mesmo padrão de invalidação cruzada que o upload já usa entre
suas telas. *Alternativa descartada:* remover a linha localmente e não invalidar
o explorador — deixaria o explorador com cache velho (item ausente) até o próximo
fetch.

### D6 — 403 fail-closed reusa `handlePermissionError`
Um 403 no restore (item expurgado no intervalo, deixou de ser raiz, permissão
perdida) cai no mesmo tratamento já provado nas Fatias 2–3: `ApiError` com
`status === 403` ⇒ `message.error` de permissão insuficiente **e**
`invalidateQueries(['trash'])` para recarregar a lista (o item some se foi mesmo
expurgado). A SPA **não** distingue os subcasos do 403 (o servidor os unifica de
propósito). *Alternativa descartada:* mensagens específicas por subcaso —
impossível, o backend retorna 403 indistinto por design de segurança.

### D7 — Camada de dados: Zod espelhando `@gdoc/shared`, sem `any`
`trashListResponseSchema: z.ZodType<TrashListResponse>` valida a fronteira de
`GET /trash`; o item usa o enum `GrantResourceType` de `@gdoc/shared` para
`type`. `fileRestoreResponseSchema` valida **apenas** o campo que a UI usa da
resposta de restaurar arquivo (`redirectedToRoot`, mais os campos de
`FileSummaryResponse` já cobertos por `fileSummaryResponseSchema`) — se o DTO
mudar sem o schema acompanhar, o `tsc` acusa. Os três hooks (`useTrash`,
`useRestoreFile`, `useRestoreFolder`) vivem em `lixeira/queries.ts`, espelhando
`navegacao/queries.ts`. A resposta de restaurar pasta (`FolderRestoreResponse`)
não é lida pela UI além do sucesso, então não precisa de schema próprio.

## Risks / Trade-offs

- **Item vencido ainda listado (janela entre `GET /trash` e o expurgo das 3h)** →
  o usuário tenta restaurar e recebe 403. Mitigação: o 403 fail-closed (D6) já
  trata isso — mostra aviso e recarrega, o item some. A Tag mostra 0 dias como
  sinal visual. Não há corrida de dados perigosa: o servidor é a fonte da verdade.
- **Sem coluna "quem excluiu"** → em unidade com vários administradores, não se
  vê quem mandou o item à lixeira. Mitigação: documentado como lacuna conhecida;
  `TrashEntryResponse` não carrega o dado. Entra se o DTO ganhar `deleted_by`.
- **Lista pode crescer em unidades ativas** → `GET /trash` não pagina. Mitigação:
  a retenção é de 30 dias (o expurgo limpa o acúmulo); a `Table` do AntD ordena e
  pagina no cliente. Paginação de servidor entra se o volume exigir — mesma
  decisão registrada na busca.
- **Restaurar não leva o usuário ao local de destino** → após restaurar, o item
  reaparece no explorador, mas a lixeira não navega até lá. Mitigação: a mensagem
  de sucesso diz onde foi (origem ou raiz, D3); navegar para o destino é refino
  futuro, não requisito da US 6.1.

## Migration Plan

Sem migração de dados nem de schema — fatia puramente aditiva de frontend.
Passos: adicionar schemas/hooks, a `LixeiraPage`, a rota `/lixeira` e o item de
menu; os testes reusam a infra existente. Rollback = reverter o commit (nenhum
estado persistido, nenhum contrato alterado).

## Open Questions

Nenhuma bloqueante. Um eventual campo `deleted_by` em `TrashEntryResponse` (que
destravaria a coluna "quem excluiu") e uma exclusão permanente sob demanda são
decisões de changes de backend futuras, fora desta fatia.
