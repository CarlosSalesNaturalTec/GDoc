# Tasks

## 1. API e contrato

- [ ] 1.1 `FileSummaryResponse.requiredReading?` em `packages/shared`.
- [ ] 1.2 `fileSummaryColumns`: coluna `required_reading` (revisão atual
  marcada, não obsoleto) e projeção em `toFileSummaryResponse` (design.md D4).
- [ ] 1.3 Testes: listagem com revisão marcada, revisão nova sem marcação e
  obsoleto (admin).

## 2. Web

- [ ] 2.1 `lib/schemas.ts`: `requiredReading` opcional com `.catch(undefined)`.
- [ ] 2.2 `leitura/queries.ts`: leituras abertas e contagem derivadas de
  `useMyReadings` (design.md D1, D2).
- [ ] 2.3 Destino `/leituras` (`LeiturasPage`) com abas Pendentes e
  Concluídas; "Ler e confirmar ciência" abre o `PreviewModal` (D3, D5).
- [ ] 2.4 Item Leitura obrigatória no menu, entre Compartilhados e Lixeira,
  com contador e nome acessível com a contagem (D6).
- [ ] 2.5 Cartão "Leitura obrigatória" do Início com as pendências, prazo,
  botão e "Ver todas"; "Avisos" continua reservado.
- [ ] 2.6 Ícone na linha do arquivo do explorador por `requiredReading` (D4).
- [ ] 2.7 Testes dos cenários de `tela-inicial`, `web-shell-e-auth`,
  `web-navegacao` e `leitura-obrigatoria`.

## 3. Documentação e fechamento

- [ ] 3.1 Manual: página de leitura obrigatória (abas, cartão, ícone) e tela
  inicial.
- [ ] 3.2 PRD: US 12.4.
- [ ] 3.3 Plano: C2 entregue, lacunas.
- [ ] 3.4 `lint`, `build`, `test`, `format:check`; conferir no navegador.
