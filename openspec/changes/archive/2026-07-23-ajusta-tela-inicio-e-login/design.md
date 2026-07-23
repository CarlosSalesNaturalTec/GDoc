## Context

Mudança de acabamento no front-end (`apps/web`), sem impacto em backend, DTOs
ou infra. Três ajustes pontuais:

1. `src/app/PlaceholderPage.tsx` — componente compartilhado hoje usado apenas
   pela tela de Início (`HomePage`). Renderiza um `Result status="info"` do Ant
   Design, cujo ícone padrão é um círculo com "!" e que traz um `subTitle` de
   andaime apontando para `docs/frontend_roadmap.md`.
2. `src/auth/LoginPage.tsx` — hoje calcula o destino pós-login com
   `redirectTarget(location.state)`, que retorna `state.from.pathname ?? '/'`
   (deep-link gravado pela guarda `RequireAuth`).
3. `public/favicon.svg` — já existe: um ícone de pasta branca sobre fundo azul
   arredondado (o mesmo do favicon do documento).

A escolha (confirmada na exploração) foi editar o `PlaceholderPage`
compartilhado diretamente — **Opção A** — já que nenhuma outra tela o consome
atualmente.

## Goals / Non-Goals

**Goals:**
- Remover o subtítulo de andaime da tela de Início.
- Exibir o ícone do favicon no círculo acima de "Bem-vindo", no lugar do "!".
- Fazer o login navegar sempre para a Início (`/`), descartando o deep-link.

**Non-Goals:**
- Exibir o nome do usuário na barra superior (segue apenas o papel) — fora de
  escopo, exigiria ampliar `AuthenticatedIdentity` e a cadeia backend.
- Criar uma `HomePage` com conteúdo próprio; o `PlaceholderPage` permanece o
  componente da Início.
- Qualquer alteração em backend, `packages/shared`, banco ou infra.

## Decisions

### D1 — Editar o `PlaceholderPage` compartilhado (Opção A)
Remover a prop/uso de `subTitle` e substituir o ícone do `Result` via a prop
`icon`, apontando para o favicon: `icon={<img src="/favicon.svg" ... />}`.
O favicon vive em `public/`, então é servido na raiz (`/favicon.svg`) tanto no
dev (Vite) quanto em produção (SPA na mesma origem). Dar ao `<img>` um tamanho
compatível com o círculo do `Result` (ex.: largura ~72px) e `alt=""` (decorativo,
já que "Bem-vindo ao GDoc" é o título acessível).

_Alternativa considerada:_ dar à `HomePage` conteúdo próprio e manter o
`PlaceholderPage` genérico. Descartada a pedido — Opção A é mais enxuta e
nenhuma outra tela usa o placeholder hoje.

### D2 — Login sempre para `/`
Substituir `navigate(redirectTarget(location.state), { replace: true })` por
`navigate('/', { replace: true })`, e o guard `if (status === 'authenticated')`
por `<Navigate to="/" replace />`. A função `redirectTarget` e a interface
`LocationState` deixam de ser necessárias e podem ser removidas do arquivo.
A guarda `RequireAuth` pode continuar gravando `state={{ from: location }}` (é
inofensivo — apenas deixa de ser consumido); não é preciso alterá-la.

_Alternativa considerada:_ parar de gravar `from` no `RequireAuth`. Desnecessário
e ampliaria o diff sem benefício.

## Risks / Trade-offs

- **Perda do retorno ao deep-link após login** → é exatamente o comportamento
  pedido; documentado no spec (cenário "Login descarta o deep-link solicitado").
- **Ícone do favicon não carregar no `Result`** → baixo risco; `public/favicon.svg`
  já é servido na raiz e referenciado pelo `index.html`. Um `alt=""` garante que
  a ausência do recurso não afete o nome acessível da tela.
- **Testes existentes** → `login.test.tsx` e `require-auth.test.tsx` afirmam o
  título "Bem-vindo ao GDoc" (mantido) e não checam subtítulo nem deep-link;
  permanecem verdes.
