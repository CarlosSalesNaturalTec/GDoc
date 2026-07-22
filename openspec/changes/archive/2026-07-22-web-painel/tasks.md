## 1. Camada de dados

- [x] 1.1 Adicionar `dashboardResponseSchema` em `apps/web/src/lib/schemas.ts`,
      tipado `z.ZodType<DashboardResponse>` (`@gdoc/shared`), cobrindo
      `cards`, `filesByType`, `uploadsByMonth` e `storage` (design.md D4)
- [x] 1.2 Criar `apps/web/src/painel/queries.ts` com `useDashboard`
      (`queryKey: ['dashboard']`, `GET /dashboard` via `apiClient`, parse pelo
      schema) — só leitura, sem mutations

## 2. Componentes e página

- [x] 2.1 Criar o componente local de gráfico de barras (`GraficoBarras`) em
      SVG/HTML com `theme.useToken()` — barras proporcionais ao maior valor,
      rótulo e contagem visíveis como texto, zero renderizado como barra vazia
      com valor "0" (design.md D1)
- [x] 2.2 Criar `apps/web/src/painel/PainelPage.tsx`: quatro cartões
      `Card`/`Statistic` (total de arquivos, pessoas, espaço usado via
      `formatFileSize`, % da cota com 1 casa), bloco "Arquivos por tipo"
      (categorias na ordem fixa do enum com rótulos pt-BR, zeradas incluídas —
      design.md D3), bloco "Envios por mês" (rótulos `dayjs` "mmm/aa", ordem do
      servidor) e bloco "Espaço utilizado × disponível" com `Progress` +
      absolutos (design.md D2)
- [x] 2.3 Estados: `Spin` no carregamento; `403` → `Result` de aviso neutro
      padrão; demais erros → `Result` genérico com tentar novamente; resposta
      zerada não é erro (design.md D5)
- [x] 2.4 Trocar o `PlaceholderPage` pela `PainelPage` em
      `apps/web/src/app/router.tsx` (rota `/admin/painel`, guarda inalterada);
      remover `PlaceholderPage` se ficar sem uso

## 3. Testes (um por cenário de spec)

- [x] 3.1 Admin vê os quatro cartões e os três blocos com os números do
      servidor (US 8.2 cenário 1), via `renderApp` + `mock-fetch`
- [x] 3.2 Estado de carregamento exibido antes da resposta
- [x] 3.3 Série de 12 meses: 12 barras, ordem cronológica, rótulos pt-BR,
      zeros visíveis
- [x] 3.4 Categorias: sete rótulos pt-BR na ordem fixa, zero nas ausentes da
      resposta
- [x] 3.5 Usado × disponível coerente com `storage` (proporção + absolutos,
      sem recálculo)
- [x] 3.6 Repositório vazio: cartões e barras zerados, sem erro
- [x] 3.7 `403` em `GET /dashboard` exibe o aviso neutro, sem números

## 4. Verificação e documentação

- [x] 4.1 `npm run lint && npm run build && npm run test` verdes na raiz
- [x] 4.2 Marcar a Fatia 10 como entregue em `docs/frontend_roadmap.md`
