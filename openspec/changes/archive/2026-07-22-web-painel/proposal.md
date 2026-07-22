## Why

O backend do painel gerencial (**Épico 8, US 8.2**) já está pronto e arquivado
(`apps/api/src/routes/dashboard.ts`, capability `painel`), expondo
**`GET /dashboard`** — admin-only, alcance imposto pela RLS da transação tenant
(`unit_admin` vê a própria unidade; `global_admin` vê o agregado global), numa
única resposta consistente (`DashboardResponse` de `@gdoc/shared`): cartões,
arquivos por tipo, envios por mês (12 meses, zeros incluídos) e espaço utilizado
versus disponível. Mas **não há como consumir o painel pela SPA**: a rota
`/admin/painel` existe apenas como `PlaceholderPage`, e sem ela o administrador
não acompanha a saúde do repositório (RF #14). Esta é a **Fatia 10** do roadmap
de frontend — a última — cobrindo o lado de frontend da **US 8.2**.

Como toda fatia do roadmap, esta é **frontend-pura**: consome o backend já
pronto sem tocar em `apps/api` nem em `packages/shared`.

## What Changes

- **Página `/admin/painel` real (US 8.2 cenário 1)**: substitui o
  `PlaceholderPage` por uma `PainelPage` que chama **`GET /dashboard`** uma vez
  (TanStack Query) e apresenta, no alcance do administrador: os **cartões de
  estatística** (total de arquivos, total de pessoas, espaço utilizado,
  percentual da cota) e os **três gráficos** — arquivos por tipo, envios por mês
  e espaço utilizado versus disponível. A rota **já existe** no router sob a
  guarda `[unit_admin, global_admin]` e o item de menu "Painel" **já aparece**
  no shell só para admins (acessível pelo menu lateral, como pede o cenário);
  esta fatia só troca o conteúdo da rota.
- **Gráficos no design system, sem dependência nova**: decisão fechada na
  exploração — **sem `@ant-design/plots`** (seria uma dependência nova, pesada e
  invisível ao jsdom, usada só por esta fatia). Os dois gráficos de barras
  (arquivos por tipo, envios por mês) são **SVG/HTML próprio** estilizado pelos
  tokens do tema AntD (`theme.useToken()`); o espaço utilizado versus disponível
  usa **`Progress`** do AntD; os cartões usam **`Card`/`Statistic`**. Tudo
  renderiza em DOM real — cada cenário de spec segue testável com Testing
  Library, sem mock de biblioteca de gráfico.
- **Rótulos pt-BR**: as categorias de `FileCategory` ganham rótulo legível
  ("Imagens", "Vídeos", "Áudios", "PDFs", "Documentos de escritório", "Texto",
  "Outros") e os meses `YYYY-MM` viram rótulo curto pt-BR (ex.: "jul/26"),
  mantendo a ordem cronológica que o servidor já garante. Bytes reusam o
  `formatFileSize` existente.
- **Camada de dados**: novo schema Zod **`dashboardResponseSchema`** espelhando
  `DashboardResponse` de `@gdoc/shared`, e hook TanStack Query **`useDashboard`**
  em `painel/queries.ts`, sobre o `apiClient`.
- **403 fail-closed neutro**: a guarda de rota já esconde o painel do
  colaborador, mas a API é o guardião — um `403` direto do `GET /dashboard`
  exibe o aviso neutro padrão (`Result`), sem expor números, como nas fatias
  anteriores.
- **Testes** (Vitest + Testing Library) reusando `renderApp` + `mock-fetch`
  das fatias anteriores, um teste por cenário de spec.

### Fora de escopo (mudanças futuras)

- **Sem auto-refresh nem parâmetros de período**: `GET /dashboard` não tem query
  params (a janela é fixa: últimos 12 meses); a página carrega no acesso e
  atualiza pelos padrões do TanStack Query. Seleção de período entra quando o
  backend a expuser.
- **Sem quebra por unidade para o `global_admin`**: o backend agrega tudo no
  alcance — não há dimensão por unidade na resposta (nem `GET /units` para
  rotular). O painel do `global_admin` é o total global; a visão por unidade
  fica para uma change de backend futura.
- **Sem exportação** (CSV/imagem) dos números/gráficos — não há endpoint nem
  requisito no PRD.
- **`@ant-design/plots`**: fica documentado como evolução possível se o painel
  ganhar gráficos mais ricos (pizza, séries múltiplas); nesta fatia a decisão é
  SVG/HTML próprio (ver design.md).
- **Qualquer mudança em `apps/api` ou `packages/shared`**: intocados; esta
  fatia só os consome.

## Capabilities

### New Capabilities
- `web-painel`: o painel gerencial na SPA — página `/admin/painel` (só
  `unit_admin`/`global_admin`, acessível pelo menu lateral) que consome
  `GET /dashboard` e apresenta os cartões de estatística e os três gráficos
  (arquivos por tipo, envios por mês, espaço utilizado versus disponível) no
  alcance do administrador, com gráficos em SVG/HTML próprio no tema AntD,
  rótulos pt-BR, estados de carregamento/erro e 403 fail-closed neutro. Cobre o
  lado de frontend da **US 8.2** e do **RF #14**.

### Modified Capabilities
<!-- Nenhuma: a API e os contratos compartilhados não mudam de comportamento;
     esta fatia só adiciona a leitura de frontend sobre um endpoint já
     existente. -->

## Impact

- **Novo código** (`apps/web`): `painel/PainelPage.tsx` (cartões + três blocos
  de gráfico + estados de carregamento/erro/403), `painel/queries.ts`
  (`useDashboard`) e um componente local de gráfico de barras em SVG/HTML
  (reusado pelos blocos "arquivos por tipo" e "envios por mês").
- **Router** (`apps/web/src/app/router.tsx`): a rota `/admin/painel` troca o
  `PlaceholderPage` pela `PainelPage` — **sem** mudança de guarda (já é
  `[unit_admin, global_admin]`). Se o `PlaceholderPage` ficar sem uso, sai.
- **Camada de dados** (`apps/web/src/lib/schemas.ts`): novo
  `dashboardResponseSchema` amarrado a `DashboardResponse` de `@gdoc/shared`
  (`z.ZodType<T>`).
- **Reuso**: `apiClient`, `formatFileSize`, `fileCategory`/`FileCategory` de
  `@gdoc/shared` (rótulos), o padrão de aviso neutro de 403 das fatias
  anteriores, `renderApp` + `mock-fetch` dos testes.
- **Contratos** (`packages/shared`): **sem mudança** — `DashboardResponse` e
  subtipos consumidos como estão.
- **API** (`apps/api`): **sem mudança** — a fatia só consome `GET /dashboard`,
  já arquivado.
- **Dependências**: **nenhuma nova** — decisão explícita de não adotar
  `@ant-design/plots` nesta fatia.
- **Testes** (`apps/web`, Vitest + Testing Library): admin vê cartões e os três
  gráficos com os números do alcance; série de 12 meses renderiza zeros e ordem
  cronológica com rótulos pt-BR; categorias com rótulo pt-BR; usado × disponível
  coerente com `storage`; estado de carregamento; 403 fail-closed neutro.
- **Docs**: `docs/frontend_roadmap.md` — marcar a Fatia 10 como
  proposta/entregue.
