## Context

As Fatias 2–4 (`web-navegacao`, `web-visualizacao`, `web-upload`, arquivadas)
entregaram o explorador (`Table`, `Breadcrumb`, o padrão **403 fail-closed** via
`handlePermissionError`), a visualização/download (`PreviewModal`,
`useDownloadFile`) e o envio. O usuário navega, consome e envia — mas só
**encontra** arquivos navegando pasta a pasta. Não há busca transversal na SPA.

O backend (Épico 9, `apps/api/src/routes/search.ts`, arquivado) é o **único
guardião de permissão** e já expõe tudo que esta fatia precisa — nenhuma
mudança de API:

| Endpoint | Uso | DTO (`@gdoc/shared`) |
|---|---|---|
| `GET /files/search` | busca por nome + filtros | `SearchFilesQuery` → `SearchFilesResponse` |
| `GET /users` | popular o filtro de autor (**admin-only**, ver D2) | `PersonResponse[]` |

Contrato de `GET /files/search` (query string, todos opcionais, combinam em AND):

```
q?       string   nome (ILIKE '%q%')
type?    string   categoria FileCategory: image|video|audio|pdf|office|text|other
author?  string   UUID do dono (owner_id)
dateFrom? string  data ISO (inclusiva) sobre created_at
dateTo?  string   data ISO (inclusiva — servidor usa início do dia seguinte)
→ SearchFilesResponse { files: FileSummaryResponse[] }   // ordenado created_at DESC, LIMIT 500
```

Regras de governança já implementadas no servidor, que o cliente **não
duplica**, apenas respeita:

- **Escopo de permissão + RLS + lixeira**: os resultados já vêm filtrados por
  `visibleResourceClause` (verbo `view`), pela RLS por unidade da transação
  tenant e pela exclusão de itens na lixeira — a SPA lista o que vier.
- **Validação de filtro no servidor**: `type` fora do enum, `author` que não é
  UUID, ou data malformada retornam **400**. A SPA emite valores válidos por
  construção (Select do enum, Select de pessoa, `RangePicker`), então o 400 é
  defensivo, não um caminho de UX esperado.
- **Limite fixo de 500**: paginação por cursor fica para quando o volume exigir
  (decisão registrada no backend); a SPA exibe o que vier.

## Goals / Non-Goals

**Goals:**
- Busca por nome + filtros combináveis de tipo e data para qualquer papel —
  US 9.1 (cenário 1), RF #15.
- Botão de limpar filtros que retorna ao estado inicial permitido —
  US 9.1 (cenário 2).
- Filtro de autor para administrador, com a lacuna do colaborador documentada
  (Opção A, D2).
- Reuso máximo da fundação: `apiClient`, TanStack Query, Zod,
  `PreviewModal`/`useDownloadFile`, `format.ts`, `renderApp`/`mock-fetch`.

**Non-Goals:**
- Filtro de autor para colaborador — **sem endpoint de pessoas
  seguro-para-colaborador** (D2). Fica para change futura.
- Coluna de autor na tabela (mesma lacuna de nome de dono, D2/D5).
- Paginação/cursor; busca por conteúdo (full-text); busca restrita a uma pasta.
- Ações de mutação (renomear/excluir) a partir dos resultados — permanecem no
  explorador.
- Qualquer mudança em `apps/api` ou `packages/shared` — só consumo.

## Decisions

### D1 — Página própria `/busca`, não filtros embutidos no explorador
A busca é **transversal à unidade** (sem âncora de pasta) e devolve só arquivos,
enquanto o explorador é ancorado numa pasta e mistura pastas+arquivos com ações
de gestão. Misturar os dois modos no mesmo componente confundiria breadcrumb,
upload e criação de pasta (todos relativos à pasta corrente) com uma lista sem
lugar. Decisão: **rota nova `/busca`** (sob `RequireAuth`, qualquer papel) e
**item "Buscar" no menu** do `AppShell`, ao lado de "Arquivos". *Alternativa
descartada:* um modo de busca dentro do `ExplorerPage` — acopla dois fluxos com
estados incompatíveis.

### D2 — Filtro de autor restrito a administrador (Opção A)
`GET /files/search` aceita `author` como **UUID**, mas transformar nome→UUID
exige uma lista de pessoas, e a única que existe — `GET /users` — é
**admin-only** (403 para colaborador). Além disso `FileSummaryResponse` carrega
só `ownerId`, sem nome. Três caminhos foram pesados: (A) filtro de autor só para
admin, usando `GET /users`, colaborador sem autor; (B) criar antes um endpoint
de pessoas seguro-para-colaborador (expande escopo p/ backend); (C) campo de
UUID cru (UX inviável). Decisão: **Opção A** — renderizar o `Select` de autor
**somente** para `unit_admin`/`global_admin`; o colaborador recebe nome+tipo+data
e a SPA **não chama** `GET /users`. Mantém a fatia **frontend-pura** e entrega
valor já, no mesmo espírito da lacuna de "renomear pasta" (Fatia 2). O filtro de
autor para colaborador é **lacuna conhecida**, destravada por um endpoint futuro
de pessoas (ex.: autores de arquivos visíveis na unidade, `{id, nome}`). *Por
que não B agora:* sequenciar backend antes contraria o roadmap ("Endpoints:
`GET /files/search`") e a postura frontend-pura das Fatias 3/4.

### D3 — Estado dos filtros = fonte da query; "sem filtro" é uma busca válida
Um único objeto de estado (`{ q, type, author, dateRange }`) é a **fonte da
verdade**; o hook `useSearchFiles(params)` tem `queryKey` derivada dele e monta
a query string **incluindo só os campos ativos** (campo vazio/indefinido é
omitido, não enviado vazio). O **estado inicial** é tudo vazio ⇒ uma chamada
`GET /files/search` **sem parâmetros** ⇒ o "estado inicial permitido" (todos os
visíveis, ≤500). O botão **"Limpar filtros"** simplesmente reseta o estado para
vazio — a mesma chamada inicial refaz-se sozinha por mudança de `queryKey`. Não
há caminho separado de "resetar": limpar e o estado inicial são o mesmo ponto.
*Alternativa descartada:* só buscar quando houver ≥1 filtro — deixaria a página
vazia na entrada e complicaria o "voltar ao estado inicial".

### D4 — `type` a partir do enum `FileCategory`; datas dayjs → `YYYY-MM-DD`
As opções do `Select` de tipo derivam do enum `FileCategory` de `@gdoc/shared`
(fonte única que o servidor valida), com um mapa local **valor→rótulo pt-BR**
(imagem, vídeo, áudio, PDF, documento de escritório, texto, outros) — sem
strings soltas que possam divergir do backend. O `RangePicker` entrega
`dayjs`; a SPA formata cada extremo como `YYYY-MM-DD` para `dateFrom`/`dateTo`.
`dateTo` é **inclusivo** no dia (o servidor já converte para início do dia
seguinte, exclusivo) — a SPA não faz aritmética de data. *Alternativa
descartada:* dois `DatePicker` separados — o `RangePicker` já garante
início≤fim e é um controle só.

### D5 — Tabela de resultados só-arquivos, reusando visualização/download
A busca não retorna pastas, então a tabela é mais simples que a do explorador:
colunas **Tipo · Nome · Tamanho · Data · Ações**, reusando `formatDate`/
`formatFileSize` de `navegacao/format.ts`. As ações reusam **`PreviewModal`** e
**`useDownloadFile`** de `visualizacao/*` — nome clicável e "Visualizar" abrem o
preview; "Baixar" usa a URL assinada `attachment`; o 403 dessas ações herda o
`handlePermissionError` já provado. **Não** há coluna de autor (sem fonte de
nome de dono acessível — D2) nem ações de renomear/excluir (ficam no explorador,
que tem contexto de pasta). *Sobre extração:* as ações de linha do explorador
hoje são inline; esta fatia **duplica o mínimo** (botões Visualizar/Baixar) em
vez de extrair um componente compartilhado agora — a extração fica para quando
uma terceira tela precisar das mesmas ações, evitando abstração prematura.

### D6 — Camada de dados: Zod espelhando `@gdoc/shared`, sem `any`
`searchFilesResponseSchema: z.ZodType<SearchFilesResponse>` reusa o
`fileSummaryResponseSchema` já existente (`z.array(fileSummaryResponseSchema)`)
— se o DTO mudar sem o schema acompanhar, o `tsc` acusa. Para o filtro de autor,
um schema mínimo valida de `GET /users` **apenas os campos usados** (id + nome),
tolerando os demais campos de `PersonResponse` (o Select não precisa deles). Os
dois hooks (`useSearchFiles`, `useAuthorOptions`) vivem em `busca/queries.ts`,
espelhando o padrão de `navegacao/queries.ts`.

## Risks / Trade-offs

- **Colaborador sem filtro de autor (D2)** → cobertura parcial da US 9.1 para a
  persona Colaborador. Mitigação: documentado como lacuna conhecida na proposta
  e no roadmap; destravado por um endpoint de pessoas futuro. Nome+tipo+data já
  cobrem a maioria dos casos de "achar meu arquivo".
- **Teto de 500 resultados sem paginação** → uma busca ampla pode truncar
  silenciosamente. Mitigação: aceitar o limite do backend nesta fatia (é a
  decisão registrada lá); filtros combináveis reduzem o conjunto. Paginação
  entra quando o volume exigir.
- **`GET /users` retorna todas as pessoas da unidade (admin)** → em unidades
  grandes o Select de autor pode ficar longo. Mitigação: o `Select` do AntD tem
  busca por rótulo (`showSearch`); é o mesmo dado que a Fatia 9 (pessoas) usará.
- **400 defensivo de filtro inválido** → só ocorre se algum controle emitir
  valor fora do contrato. Mitigação: valores são válidos por construção; um erro
  inesperado cai no tratamento genérico de erro da query (mensagem, sem travar).

## Migration Plan

Sem migração de dados nem de schema — fatia puramente aditiva de frontend.
Passos: adicionar schema/hooks, a `BuscaPage`, a rota `/busca` e o item de menu;
os testes reusam a infra existente. Rollback = reverter o commit (nenhum estado
persistido, nenhum contrato alterado).

## Open Questions

- Nenhuma bloqueante. O formato exato do futuro endpoint de pessoas
  seguro-para-colaborador (que destrava o filtro de autor do colaborador) é
  decisão da change de backend correspondente, fora desta fatia.
