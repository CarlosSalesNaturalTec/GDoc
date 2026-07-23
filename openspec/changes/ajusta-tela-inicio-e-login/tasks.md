## 1. Tela de Início (`PlaceholderPage`)

- [ ] 1.1 Em `apps/web/src/app/PlaceholderPage.tsx`, remover o `subTitle`
      "Esta tela chega em uma próxima fatia da implementação (ver
      docs/frontend_roadmap.md)." do `Result`.
- [ ] 1.2 Substituir o ícone padrão do `Result` (o "!" de `status="info"`) pelo
      favicon, via `icon={<img src="/favicon.svg" alt="" width={72} />}`,
      mantendo o título "Bem-vindo ao GDoc".
- [ ] 1.3 Ajustar/atualizar o comentário do componente para refletir que a tela
      é a Início definitiva, não mais um andaime de roadmap.

## 2. Redirecionamento pós-login (`LoginPage`)

- [ ] 2.1 Em `apps/web/src/auth/LoginPage.tsx`, trocar o destino pós-login para
      `navigate('/', { replace: true })` e o guard de sessão autenticada para
      `<Navigate to="/" replace />`.
- [ ] 2.2 Remover a função `redirectTarget`, a interface `LocationState` e o uso
      de `location.state` que ficaram sem uso; limpar o import de `useLocation`
      se não for mais necessário.

## 3. Verificação

- [ ] 3.1 Rodar `npm run lint` e `npm run build` na raiz sem erros.
- [ ] 3.2 Rodar `npm run test --workspace apps/web` e confirmar que
      `login.test.tsx` e `require-auth.test.tsx` continuam passando.
- [ ] 3.3 Conferir manualmente (dev) que a Início mostra o ícone do favicon sem
      o subtítulo e que o login leva sempre a `/`.
