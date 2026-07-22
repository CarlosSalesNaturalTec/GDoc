## Context

O bloco de serving estático em `apps/api/src/app.ts` monta `express.static` com um
callback `setHeaders` que decide o `Cache-Control` pela classe do artefato:

```ts
setHeaders: (res, filePath) => {
  if (filePath.startsWith(join(webDistDir, 'assets') + '/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}
```

`filePath` é o caminho absoluto no sistema de arquivos, já com o separador nativo
do SO (via a lib `send`, que usa `path`). O prefixo comparado, porém, é montado
com `join(...)` (separador nativo) seguido de um `/` **literal**. Em POSIX ambos
são `/` e a comparação casa; no Windows o `filePath` traz `...\assets\app.js`
enquanto o prefixo vira `...\assets/`, e o `startsWith` retorna `false`. Sem o
branch, `express.static` aplica seu default `Cache-Control: public, max-age=0`.

O CI roda em Linux, então a suíte passa lá e o bug só aparece em dev no Windows
(`web-serving.test.ts` → "Asset com hash é imutável": esperado
`public, max-age=31536000, immutable`, recebido `public, max-age=0`).

## Goals / Non-Goals

**Goals:**
- Emitir o `Cache-Control` imutável para `/assets/*` de forma idêntica em qualquer
  SO, corrigindo o bug de separador.
- Manter a suíte `web-serving.test.ts` verde de forma determinística em Windows e
  Linux, sem depender do SO do runner.

**Non-Goals:**
- Alterar os valores da política de cache (`max-age`, `immutable`, `no-store`).
- Alterar o fallback de rotas client-side ou a guarda de prefixos de API.
- Refatorar o serving estático para outra abordagem (ex.: middleware próprio).

## Decisions

**D1 — Usar o separador de plataforma em vez do `/` literal.**
Trocar `join(webDistDir, 'assets') + '/'` por `join(webDistDir, 'assets') + sep`,
importando `sep` de `node:path`. `sep` resolve para `\` no Windows e `/` em POSIX,
casando exatamente com o separador que a lib `send` usa em `filePath`. É a mudança
mínima, sem normalização de strings nem regex, e mantém o mesmo formato de
comparação já existente.

Alternativas descartadas:
- Normalizar `filePath` trocando `\`→`/` antes do `startsWith`: funciona, mas
  introduz manipulação de string frágil e diverge da forma nativa dos caminhos.
- Passar `maxAge`/`immutable` via opções do `express.static` e tratar o
  `index.html` à parte: muda mais superfície do que o bug exige e reescreve
  política já especificada — fora do escopo deste change.

## Risks / Trade-offs

- Risco baixo: mudança de uma única expressão, coberta por teste existente que
  falha hoje no Windows e passará a validar o comportamento nos dois SOs.
- Trade-off: a robustez adicional depende de `filePath` e do prefixo usarem o
  mesmo separador nativo — invariante garantido por `path.join`/`send`. Se uma
  versão futura do `express`/`send` normalizar `filePath` para `/`, a comparação
  com `sep` continuaria correta em POSIX e exigiria revisão apenas no Windows;
  o cenário de teste dedicado a `\` sinalizaria a regressão.
