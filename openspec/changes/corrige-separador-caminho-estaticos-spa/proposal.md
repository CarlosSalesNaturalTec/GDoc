## Why

O serving estático da SPA (`apps/api/src/app.ts`) detecta assets sob `/assets/*`
concatenando um `/` literal ao caminho do diretório (`join(webDistDir, 'assets') + '/'`).
No Windows, `path.join` usa `\` como separador e o `filePath` entregue pelo
`express.static` também usa `\`, então o `startsWith('...assets/')` nunca casa: o
header `Cache-Control` imutável não é aplicado e o asset sai com o default
`public, max-age=0`. O bug fica invisível no CI (Linux, onde o separador é `/`) e
só falha em dev no Windows — quebrando o requisito "Política de cache por classe
de artefato" de `publicacao-frontend` e a assertiva correspondente em
`web-serving.test.ts`.

## What Changes

- Corrigir a detecção de assets em `apps/api/src/app.ts` para usar o separador de
  plataforma (`sep` de `node:path`) em vez do `/` literal, de modo que
  `/assets/*` receba `Cache-Control: public, max-age=31536000, immutable` em
  qualquer sistema operacional.
- Blindar o comportamento contra regressões de portabilidade, garantindo que a
  cobertura de `web-serving.test.ts` passe de forma determinística em Windows e
  Linux.

## Capabilities

### New Capabilities
<!-- Nenhuma capability nova. -->

### Modified Capabilities
- `publicacao-frontend`: clarifica o requisito "Política de cache por classe de
  artefato" para exigir que a detecção do prefixo `/assets/*` seja **independente
  do separador de caminho do sistema operacional**, tornando explícito que o
  header imutável deve ser emitido tanto em Windows quanto em Linux.

## Impact

- Código: `apps/api/src/app.ts` (bloco de serving estático da SPA).
- Testes: `apps/api/src/__tests__/web-serving.test.ts` — a assertiva de
  `Cache-Control immutable` passa a verde; sem novas dependências.
- Sem impacto em produção (Cloud Run roda Linux, onde o comportamento já estava
  correto por acaso); o ganho é paridade dev↔prod e correção de um bug latente de
  portabilidade.
- Fora de escopo: qualquer alteração na política de cache em si (valores de
  `max-age`, `no-store` do `index.html`) e no fallback de rotas client-side —
  permanecem como especificado em `publicacao-frontend`.
