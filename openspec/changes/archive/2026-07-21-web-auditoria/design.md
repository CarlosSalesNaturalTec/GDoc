## Context

As Fatias 2–7 (`web-navegacao`, `web-visualizacao`, `web-upload`, `web-busca`,
`web-permissoes`, `web-lixeira`, arquivadas) entregaram o explorador com **ações
por-linha** (`Table` + `Space` de botões), o padrão **403 fail-closed** via
`handlePermissionError`, e — o precedente mais próximo desta fatia — o
**`PermissoesModal`**, um modal por-recurso aberto de uma ação da linha, gated por
`isAdmin`, que consome um endpoint **por-recurso** (`GET /grants?resource…`) via
`useQuery` habilitado só com o modal aberto (`useGrants(resourceType, resourceId,
open)`). Cada visualização e download de arquivo já é **registrado** pelo servidor
na emissão da URL assinada (Fatia 3), mas esse registro **não é consultável** pela
SPA.

O backend (Épico 7, `apps/api/src/routes/audit.ts`, arquivado) é o **único
guardião de permissão** e já expõe tudo que esta fatia precisa — nenhuma mudança
de API:

| Endpoint | Uso | DTO (`@gdoc/shared`) |
|---|---|---|
| `GET /files/:id/audit` | acessos (`view`/`download`) de um arquivo | `AuditQueryResponse` |

Contrato de `GET /files/:id/audit`:

```
→ AuditQueryResponse { events: AuditQueryEventResponse[] }
  event = { actor: { id, name: string|null, email },
            action: 'view' | 'download',
            createdAt }                              // ISO, mais recente → antigo
```

Regras de governança já implementadas no servidor, que o cliente **não duplica**,
apenas respeita:

- **Autorização mais estrita que o conteúdo** (`canReadAudit`): só o **dono**
  (`files.owner_id`) ou o **administrador da unidade** do arquivo. Possuir grant
  `view`/`download` **não** dá auditoria — ver quem acessou é direito de
  dono/admin, não consequência de poder abrir. O bypass de RLS do `global_admin`
  **não** vale para auditoria de outra unidade.
- **Só acessos**: apenas eventos `view`/`download` são retornados; os demais tipos
  de `AuditAction` (`rename`/`replace`/`delete`/`restore`) ficam de fora por
  design do Épico 7.
- **Fail-closed indistinto**: arquivo inexistente, de outra unidade (escondido
  pela RLS de `audit_events`), na lixeira (`deleted_at IS NULL`), ou do qual o
  solicitante não é dono/admin retornam o **mesmo 403**, sem corpo de auditoria e
  sem distinguir os casos.
- **Teto fixo de 500** (`AUDIT_QUERY_LIMIT`), sem paginação nem filtro por
  query-param — a rota não recebe `from`/`to`/`user`/`action`.

## Goals / Non-Goals

**Goals:**
- Consultar os acessos (`view`/`download`) de um arquivo — quem, qual ação,
  quando — a partir do explorador, para **dono ou administrador** (US 7.1, US 7.2,
  RF #11).
- Manter o servidor como único guardião: a visibilidade da ação é conveniência de
  UX; o 403 fail-closed é a rede real.
- Reuso máximo da fundação: `apiClient`, TanStack Query, Zod, `format.ts`,
  `handlePermissionError`, `useSession`, `renderApp`/`mock-fetch`, e o padrão do
  `PermissoesModal`.

**Non-Goals:**
- Filtro server-side (data/pessoa/ação) e paginação — o endpoint não os expõe;
  teto fixo de 500. O `DatePicker.RangePicker` do roadmap fica fora.
- Log de atividade completo — só `view`/`download`, nunca `rename`/`delete`/etc.
- Exportação (CSV/PDF) do registro — não há endpoint.
- Auditoria a partir da busca (Fatia 5) ou do `PreviewModal` (Fatia 3) — o roadmap
  escopa a Fatia 8 ao explorador.
- Qualquer mudança em `apps/api` ou `packages/shared` — só consumo.

## Decisions

### D1 — Visibilidade da ação: `isAdmin || file.ownerId === identity.id` (Opção A)
A ação "Auditoria" aparece na linha do arquivo quando o solicitante é
administrador **ou** é o dono do arquivo. O `ownerId` já vem em cada
`FileSummaryResponse` da listagem, e `identity.id` já está no `useSession` — a
SPA tem tudo para decidir sem chamada extra. Isso **estende** o gate `isAdmin`
que a ação "Permissões" já usa, adicionando o ramo do dono que a US 7.2 autoriza.
É explicitamente **UX, não defesa**: o servidor `canReadAudit` continua sendo o
guardião e responde 403 de qualquer forma (D5 é a rede). *Alternativa descartada
(Opção B):* sempre mostrar a ação e tratar o 403 — cria botão-morto para o
colaborador em arquivo alheio, com round-trip e toast de erro a cada clique, sem
ganho de segurança (o servidor decide igual nas duas opções).

### D2 — Modal, não página (sem tela global de auditoria)
A consulta é **por-arquivo** (`GET /files/:id/audit`) — não há endpoint de
auditoria global. Decisão: um **`AuditoriaModal`** aberto da ação da linha,
espelhando exatamente por que `PermissoesModal` é modal e não página (o
`GET /grants` também é por-recurso). **Sem rota nova**, sem item de menu. O
explorador guarda o arquivo em auditoria num estado local (`auditingFile`), como
já faz com `previewingFile`/`managingResource`. *Alternativa descartada:* uma
página `/auditoria` — não há como listar auditoria sem um arquivo alvo.

### D3 — `useQuery` habilitado só com o modal aberto (leitura pura)
Diferente de `view-url`/`download-url` (que são `useMutation` porque **emitir a
URL é o acesso auditado**), ler a auditoria é **leitura pura sem efeito
colateral** — a rota é um `SELECT`, não grava evento. Decisão:
`useFileAudit(fileId, open)` como `useQuery` com `enabled: open && !!fileId`,
igual ao `useGrants(resourceType, resourceId, open)` da Fatia 6. Abrir o modal
**não** polui a própria auditoria. *Alternativa descartada:* `useMutation`
disparado no `onOpen` — desnecessário e enganoso, sugeriria efeito colateral que
não existe.

### D4 — Apresentação: `Table` de acessos, ordenação do servidor
Uma `Table` com três colunas: **Pessoa** (`actor.name ?? actor.email` — o nome é
opcional no DTO, mesma degradação suave do `?? subjectUserId` do
`PermissoesModal`), **Ação** (`Tag` pt-BR — `view` → "Visualizar", `download` →
"Baixar", via um mapa `Record<'view'|'download', string>` como o `VERB_LABEL`), e
**Data/hora** (`createdAt` por `formatDate` de `navegacao/format.ts`). A **ordem
vem do servidor** (mais recente → antigo); a SPA não reordena. Sem paginação de
servidor; a `Table` do AntD pagina/ordena no cliente sobre os ≤500 já carregados.
*Alternativa descartada:* `Descriptions`/timeline — a `Table` é o que as fatias
anteriores usam para listas tabulares e o roadmap sugere.

### D5 — Estado vazio (não-erro) e 403 fail-closed neutro
Lista de eventos vazia ⇒ `Empty` "Nenhum acesso registrado" — **não** é erro (o
arquivo simplesmente ainda não foi acessado). Um **403** ⇒ um `Result` de
permissão insuficiente neutro, reusando o discernimento do `handlePermissionError`
já provado (Fatias 2–3): a SPA **não** distingue os subcasos do 403 (inexistente
/ outra unidade / lixeira / não-dono — o servidor os unifica de propósito) nem
expõe conteúdo. Como a ação só é oferecida a dono/admin (D1), o 403 é raro na
prática, mas o modal o trata mesmo assim — defesa em profundidade na UI, com o
servidor como fonte da verdade. *Alternativa descartada:* mensagens específicas
por subcaso — impossível, o 403 é indistinto por design de segurança.

### D6 — Camada de dados: Zod espelhando `@gdoc/shared`, sem `any`
`auditQueryResponseSchema: z.ZodType<AuditQueryResponse>` valida a fronteira de
`GET /files/:id/audit` — `events[]` com `actor { id, name: string|null, email }`,
`action` como `z.enum(['view','download'])` e `createdAt` string; se o DTO mudar
sem o schema acompanhar, o `tsc` acusa (mesmo `z.ZodType<T>` das outras fatias). O
hook `useFileAudit` vive em `auditoria/queries.ts`, espelhando
`permissoes/queries.ts`. Reusa a `AuditAction`/DTOs de `@gdoc/shared` — sem tipo
novo em `packages/shared`.

## Risks / Trade-offs

- **Visibilidade client-side pode divergir do servidor** (dado velho de
  `ownerId`, papel mudou entre carregar a lista e clicar) → a SPA poderia oferecer
  a ação a quem o servidor negará. Mitigação: o 403 fail-closed (D5) é a rede — o
  servidor decide de fato; esconder o botão nunca foi a defesa (D1). Sem risco de
  vazamento: um 403 não expõe conteúdo.
- **Teto de 500 eventos sem paginação** → um arquivo muito acessado mostra só os
  500 mais recentes. Mitigação: documentado como lacuna; cobre a esmagadora
  maioria dos casos; paginação/filtro de servidor entram numa change de backend
  futura (mesma decisão registrada na busca e na lixeira).
- **Sem filtro por data/pessoa/ação** → o `DatePicker.RangePicker` do roadmap não
  é entregue porque só filtraria client-side de forma parcial (não alcança além do
  teto). Mitigação: fora de escopo explícito; a `Table` do AntD ainda ordena as
  colunas no cliente.
- **Só `view`/`download`** → não é um log de atividade (renomear/excluir não
  aparecem). Mitigação: é o contrato do Épico 7; o título/estado vazio enquadram a
  tela como "acessos", alinhado à linguagem das US 7.1/7.2 ("quem visualizou ou
  baixou").

## Migration Plan

Sem migração de dados nem de schema — fatia puramente aditiva de frontend.
Passos: adicionar `auditQueryResponseSchema` (`lib/schemas.ts`), o hook
`useFileAudit` e o `AuditoriaModal` (`auditoria/`), e a ação "Auditoria" + o
estado `auditingFile` na `ExplorerPage`; os testes reusam a infra existente.
Rollback = reverter o commit (nenhum estado persistido, nenhum contrato alterado).

## Open Questions

Nenhuma bloqueante. Filtro/paginação server-side, exportação do registro, e a
abertura da auditoria a partir da busca ou do preview são decisões de changes
futuras (backend para as duas primeiras), fora desta fatia.
