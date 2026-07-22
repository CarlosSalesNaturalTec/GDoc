## Context

As Fatias 1–9 entregaram toda a fundação de que esta fatia precisa: o **shell
com guarda por papel** (`RequireAuth roles={[...]}`, design.md D6 da Fatia 1),
o `apiClient` same-origin, TanStack Query + Zod na fronteira e o padrão de
aviso neutro em 403 (`Result`) usado por auditoria/pessoas. A rota
**`/admin/painel` já existe** no router sob `[unit_admin, global_admin]`,
apontando hoje para um `PlaceholderPage`; o item de menu "Painel"
(`DashboardOutlined`) também já aparece só para admins — o que atende
diretamente o "acessível pelo menu lateral" da US 8.2. Esta fatia só preenche
o conteúdo da rota.

O backend (Épico 8, `apps/api/src/routes/dashboard.ts`, capability `painel`
arquivada) já expõe tudo — nenhuma mudança de API:

| Endpoint | Uso | DTO (`@gdoc/shared`) |
|---|---|---|
| `GET /dashboard` | consulta agregada única do painel | `DashboardResponse` |

Garantias do servidor que o cliente **não duplica**, apenas consome:

- **Admin-only**: `collaborator` recebe 403 — a SPA nem o deixa chegar à página
  (guarda de papel), mas o servidor decide de fato.
- **Alcance pela RLS** (design D1 do backend): `unit_admin` recebe agregados da
  própria unidade; `global_admin`, do todo. A resposta não diz qual é o alcance
  — a SPA apresenta o que veio, sem filtrar nada.
- **Série de 12 meses normalizada** (design D6 do backend): `uploadsByMonth`
  sempre tem 12 entradas `YYYY-MM` em ordem cronológica, com zero nos meses sem
  envio — a SPA **não** precisa preencher lacunas, só formatar rótulos.
- **Coerência entre blocos**: cartões e gráficos vêm do mesmo snapshot
  transacional; `cards.totalFiles` = soma de `filesByType`, `storage` deriva do
  mesmo contador da cota (US 8.1). A SPA não recalcula nem reconcilia.

## Goals / Non-Goals

**Goals:**
- Painel funcional em `/admin/painel` (US 8.2 cenário 1): cartões de
  estatística e os três gráficos, no alcance do administrador, em pt-BR.
- Zero dependência nova: gráficos dentro do design system via tokens do tema
  AntD, testáveis em DOM real (jsdom), um teste por cenário de spec.
- Reuso máximo: `apiClient`, Zod na fronteira, `formatFileSize`
  (`navegacao/format.ts`), `fileCategory`/`FileCategory` de `@gdoc/shared`,
  aviso neutro de 403, `renderApp` + `mock-fetch` nos testes.

**Non-Goals:**
- Auto-refresh/seleção de período — `GET /dashboard` não tem query params.
- Quebra por unidade para `global_admin` — a resposta é agregada, sem dimensão
  de unidade (e sem `GET /units` para rotular).
- Exportação (CSV/imagem) — sem endpoint e sem requisito no PRD.
- Mudanças em `apps/api`/`packages/shared`.

## Decisions

### D1 — Gráficos em SVG/HTML próprio com tokens do tema; sem `@ant-design/plots`

**Decisão do usuário na exploração.** Os dois gráficos de barras (arquivos por
tipo, envios por mês) são um componente local (`GraficoBarras`) que renderiza
barras em HTML/SVG dimensionadas proporcionalmente ao maior valor, colorido e
tipografado pelos **tokens do tema** (`theme.useToken()` → `colorPrimary`,
`colorFillSecondary`, `colorTextSecondary`, `borderRadius`), de modo que o
resultado é visualmente parte do design system sem depender de biblioteca.

Alternativa considerada — `@ant-design/plots` (a lib de gráficos do ecossistema
AntD): rejeitada nesta fatia porque (a) seria uma **dependência nova e pesada**
(AntV/G2) usada por uma única página com dois gráficos de barras simples;
(b) renderiza em **canvas**, invisível ao jsdom — quebraria a regra da fundação
"cada cenário de spec é um teste" ou a rebaixaria a asserções sobre props com a
lib mockada. Verificado no repositório: **nenhuma outra fatia usa** `plots`,
`@antv` ou qualquer lib de gráfico — não há reuso perdido. Se o painel evoluir
para gráficos ricos (pizza, séries múltiplas, interação), adotar a lib vira
change própria.

Consequência: as barras carregam os valores como **texto visível** (rótulo +
contagem), então os testes asseguram o comportamento observável (rótulos pt-BR,
zeros, ordem) direto no DOM.

### D2 — Usado × disponível com `Progress`; cartões com `Card`/`Statistic`

O terceiro "gráfico" (espaço utilizado versus disponível) é uma proporção
única — um **`Progress`** do AntD (percentual `storage.usedBytes /
storage.capacityBytes`) acompanhado dos absolutos por extenso ("X usados de Y
— Z disponíveis", via `formatFileSize`) comunica tudo sem gráfico dedicado.
Status do `Progress` segue a urgência (`normal` < 80% ≤ `active`/laranja < 95%
≤ `exception`), espelhando o padrão de urgência por cor da lixeira. Os quatro
cartões usam `Card` + `Statistic` (`totalFiles`, `totalPeople`,
`usedBytes` formatado, `quotaUsedPct` como percentual com 1 casa).

Alternativa — `Gauge`/`Liquid` do plots: cai com D1.

### D3 — Rótulos pt-BR mapeados localmente, dados do servidor intocados

- **Categorias**: `Record<FileCategory, string>` local (`image` → "Imagens",
  `video` → "Vídeos", `audio` → "Áudios", `pdf` → "PDFs", `office` →
  "Documentos de escritório", `text` → "Texto", `other` → "Outros"). O painel
  exibe as categorias em **ordem fixa de apresentação** (a do enum
  `FileCategory`), incluindo as com contagem zero ausentes da resposta — a
  leitura fica estável entre visitas (o servidor manda só as categorias com
  arquivo, em ordem de Map).
- **Meses**: `YYYY-MM` → rótulo curto pt-BR "mmm/aa" (ex.: `2026-07` →
  "jul/26") via `dayjs` (já dependência, locale pt-br já carregado pelo
  `ConfigProvider`), preservando a ordem cronológica do servidor.

### D4 — Fronteira de dados no padrão das fatias anteriores

`dashboardResponseSchema` em `lib/schemas.ts` tipado `z.ZodType<DashboardResponse>`
(o TS acusa se o schema divergir do DTO), e `useDashboard` em
`painel/queries.ts` com `queryKey: ['dashboard']`, sobre o `apiClient`. Sem
mutations — o painel é só leitura; sem invalidação cruzada (os números mudam
por eventos de outras fatias, mas o custo de estar minutos desatualizado é
zero para um painel gerencial; o `staleTime` padrão do projeto já cobre).

### D5 — Estados: carregamento, erro, 403 neutro

`Spin` durante o carregamento; 403 (`ApiError.status === 403`) exibe o
`Result` de aviso neutro padrão ("sem permissão", sem detalhar se a conta
mudou de papel no meio da sessão) — mesmo padrão de `PessoasPage`; demais
erros caem no `Result` de erro genérico com nova tentativa. Painel sem
arquivo algum **não é erro**: cartões mostram zero, gráficos mostram as
categorias/meses zerados (D3) — coerente com o cenário de meses vazios da
spec do backend.

## Risks / Trade-offs

- **[Gráfico próprio menos rico]** Sem eixos/tooltip/animação de uma lib.
  → Aceito: são 7 e 12 barras com valor estampado como texto — legibilidade
  igual ou melhor para o caso; evolução visual fica documentada como change
  futura (D1).
- **[Rótulo de mês via dayjs]** Depende do locale pt-br estar ativo.
  → Já é dependência direta e o `ConfigProvider` da Fatia 1 já configura
  pt-BR; teste de cenário cobre o rótulo.
- **[Números desatualizados em sessão longa]** Sem auto-refresh, o admin pode
  ver um snapshot antigo. → Aceito (non-goal); o refetch-on-focus padrão do
  TanStack Query já atualiza ao voltar à aba.
- **[Categorias zeradas ocupam espaço]** Mostrar as 7 categorias sempre (D3)
  inclui linhas zero. → Aceito: estabilidade de leitura vale mais que
  compactação num painel gerencial.
