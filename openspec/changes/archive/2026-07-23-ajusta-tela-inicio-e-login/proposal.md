## Why

A tela de Início ainda exibe o texto de andaime "Esta tela chega em uma próxima
fatia da implementação (ver docs/frontend_roadmap.md)." e um ícone genérico de
informação ("!") — apresentação de placeholder que não condiz com uma aplicação
já em uso. Além disso, ao entrar, o usuário é levado para a rota que tentou
acessar antes do login (deep-link), quando o comportamento desejado é sempre
começar pela tela de Início. São ajustes pequenos de front-end para dar
acabamento à experiência de entrada.

## What Changes

- Remover o subtítulo "Esta tela chega em uma próxima fatia da implementação
  (ver docs/frontend_roadmap.md)." do `PlaceholderPage` (tela de Início).
- Trocar o ícone "!" (ícone padrão do `Result status="info"` do Ant Design),
  no círculo acima de "Bem-vindo", pelo ícone do favicon (`/favicon.svg`).
- Após um login bem-sucedido, navegar **sempre para a tela de Início (`/`)`**,
  ignorando o deep-link `from` guardado pela guarda de rota.
- A barra superior permanece **inalterada** — continua exibindo apenas o papel
  do usuário (o nome do usuário fica fora de escopo).

## Capabilities

### New Capabilities

_Nenhuma._

### Modified Capabilities

- `web-shell-e-auth`: o cenário de login com credenciais válidas passa a
  especificar o destino — a aplicação navega **sempre para a tela de Início**,
  não mais para a rota originalmente solicitada antes do login.

## Impact

- **Código (apenas `apps/web`):**
  - `src/app/PlaceholderPage.tsx` — remoção do subtítulo e substituição do
    ícone do `Result` pelo `/favicon.svg`.
  - `src/auth/LoginPage.tsx` — o redirecionamento pós-login passa a apontar
    sempre para `/`, dispensando o `redirectTarget(location.state)`.
- **Sem impacto** em `apps/api`, `packages/shared`, banco de dados ou infra.
- **Testes:** os testes existentes (`login.test.tsx`, `require-auth.test.tsx`)
  continuam válidos — o título "Bem-vindo ao GDoc" é mantido e nenhum teste
  verifica o subtítulo ou o redirect por deep-link. Nenhuma alteração de
  contrato de API.
- **Fora de escopo:** exibir o nome do usuário na barra superior (permanece
  apenas o papel), que poderá virar uma mudança futura por exigir ampliar o
  DTO `AuthenticatedIdentity` e a cadeia backend.
