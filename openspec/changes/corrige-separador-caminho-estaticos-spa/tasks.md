## 1. Correção do separador de caminho

- [ ] 1.1 Em `apps/api/src/app.ts`, importar `sep` de `node:path` (junto com o
  `join` já usado).
- [ ] 1.2 No callback `setHeaders` do `express.static`, trocar
  `join(webDistDir, 'assets') + '/'` por `join(webDistDir, 'assets') + sep`
  (design.md D1).

## 2. Validação

- [ ] 2.1 Rodar `npm run test --workspace apps/api -- src/__tests__/web-serving.test.ts`
  e confirmar que a assertiva "Asset com hash é imutável" passa (9/9 verdes) no
  Windows.
- [ ] 2.2 Rodar `npm run test --workspace apps/api` e confirmar 146/146 passando,
  sem regressão em outras suítes.
- [ ] 2.3 Rodar `npm run lint` e `npm run build` na raiz sem erros.
