## 1. Contrato compartilhado e política de senha

- [x] 1.1 Em `packages/shared/src`, adicionar a constante de tamanho mínimo de senha e os DTOs `ChangePasswordRequest`, `ResetPasswordResponse` e `MyProfileResponse` (design.md D8)
- [x] 1.2 Criar `apps/api/src/lib/password-policy.ts` com a validação de tamanho mínimo e o gerador CSPRNG (`node:crypto`) de alfabeto sem caracteres ambíguos, consumindo a constante compartilhada (design.md D7/D8)
- [x] 1.3 Testes unitários de `password-policy`: senha curta é recusada, senha gerada satisfaz a política e não contém caracteres ambíguos, gerações sucessivas diferem
- [x] 1.4 Rodar `npm run build --workspace packages/shared` para que api e web enxerguem os DTOs novos a partir de `dist/`

## 2. Banco de dados

- [x] 2.1 Criar migration `0012_password_changed_at.sql`: adiciona `users.password_changed_at timestamptz NOT NULL DEFAULT now()` e faz o backfill das linhas existentes com `created_at` (design.md D4)
- [x] 2.2 Aplicar com `npm run migrate --workspace apps/api` e conferir que a RLS de `users` segue intacta (a coluna não é tenant-scoped por si só; `unit_id` continua sendo a chave de isolamento)

## 3. Sessão com instante de emissão

- [x] 3.1 Em `ports/auth-port.ts`, incluir o instante de emissão em `SessionClaims` (alteração de assinatura de porta — o `tsc` acusará todos os pontos afetados)
- [x] 3.2 Em `adapters/argon2-auth-port.ts`, emitir o campo no payload do token e exigi-lo na verificação; token sem o campo é inválido (design.md D3)
- [x] 3.3 Permitir que `issueSession` receba um instante de emissão explícito, para que a reemissão da sessão use o valor vindo do banco em vez do relógio do Node (design.md D2)
- [x] 3.4 Em `middleware/tenant-context.ts`, trazer `password_changed_at` no `SELECT` que já roda por requisição e recusar (401) sessão emitida antes dele
- [x] 3.5 Atualizar `__tests__/argon2-auth-port.test.ts` e os testes que forjam sessão para o novo formato de claims
- [x] 3.6 Testes de sessão: sessão anterior à troca é recusada; sessão sem instante de emissão é recusada; sessão posterior é aceita

## 4. Alteração da própria senha

- [x] 4.1 Implementar `POST /auth/password` em `routes/auth.ts`, sob `attachTenantContext`: valida corpo, verifica a senha atual, aplica a política, grava o novo hash e `password_changed_at`, com `UPDATE ... RETURNING password_changed_at`
- [x] 4.2 Reemitir o cookie de sessão usando o `password_changed_at` retornado como instante de emissão, para a sessão corrente sobreviver (design.md D2)
- [x] 4.3 Responder erro específico de senha atual incorreta, distinto da resposta genérica do login (design.md D9)
- [x] 4.4 Testes de `POST /auth/password`: troca válida; senha atual incorreta não altera nada; senha nova curta é recusada; sem sessão retorna 401; a sessão corrente segue válida após a troca e uma sessão antiga da mesma pessoa passa a ser recusada; login passa a exigir a nova senha

## 5. Perfil somente leitura

- [x] 5.1 Implementar `GET /auth/profile` em `routes/auth.ts`, devolvendo nome, e-mail, nome da unidade (join com `units`) e papel, sem qualquer material de senha (design.md D6)
- [x] 5.2 Testes: perfil devolve os dados da pessoa autenticada e nunca `password_hash`; sem sessão retorna 401

## 6. Redefinição administrativa e trava de alvo

- [x] 6.1 Criar a função única de alcance por papel do alvo (matriz de design.md D5), lendo o papel da linha alvo na mesma transação
- [x] 6.2 Implementar `POST /users/:id/password` em `routes/users.ts`: aplica a trava de alvo, gera a senha, grava hash e `password_changed_at`, e devolve a senha gerada apenas nesta resposta; ignora qualquer senha vinda do corpo
- [x] 6.3 Aplicar a mesma função de alcance ao `PATCH /users/:id`, fechando a brecha em que um `unit_admin` edita ou desativa um administrador da própria unidade (design.md D5)
- [x] 6.4 Garantir que a senha gerada não apareça em log de aplicação nem em mensagem de erro
- [x] 6.5 Aplicar a política de tamanho mínimo à senha inicial de `POST /users`
- [x] 6.6 Testes de alcance cobrindo a matriz completa: `unit_admin`→`collaborator` (ok), `unit_admin`→`unit_admin` (403), `unit_admin`→`global_admin` da própria unidade (403), `unit_admin`→pessoa de outra unidade (403 indistinguível), `global_admin`→`unit_admin` (ok), `global_admin`→`global_admin` (403), `collaborator`→qualquer (403)
- [x] 6.7 Testes de efeito do reset: todas as sessões do alvo passam a ser recusadas; a senha anterior deixa de autenticar; a senha devolvida autentica
- [x] 6.8 Testes de regressão da trava no `PATCH`: `unit_admin` não desativa nem edita administrador da própria unidade; cadastro com senha curta é recusado

## 7. SPA — Minha conta

- [x] 7.1 Adicionar os schemas Zod de `MyProfileResponse` e `ResetPasswordResponse` em `lib/schemas.ts`, espelhando os DTOs compartilhados
- [x] 7.2 Criar o módulo `apps/web/src/conta/` com as queries de `GET /auth/profile` e a mutação de `POST /auth/password`
- [x] 7.3 Criar `MinhaContaPage`: dados cadastrais somente leitura e formulário de troca de senha, com validação local de tamanho mínimo e mensagem específica para senha atual incorreta
- [x] 7.4 Registrar a rota `/minha-conta` em `app/router.tsx`, acessível a qualquer papel autenticado
- [x] 7.5 Converter a identidade do cabeçalho de `AppShell.tsx` em menu com "Minha conta" e "Sair"
- [x] 7.6 Garantir que os valores digitados não sobrevivam em cache de consulta nem em estado global após a operação
- [x] 7.7 Testes de `MinhaContaPage`: troca bem-sucedida mantém a pessoa autenticada e limpa os campos; senha curta não chama a API; senha atual incorreta exibe a causa específica; dados cadastrais não têm campo editável

## 8. SPA — reset na tela de Pessoas

- [x] 8.1 Adicionar a mutação de `POST /users/:id/password` em `pessoas/queries.ts`, entregando a senha direto ao modal, sem chave de cache
- [x] 8.2 Adicionar a ação "Redefinir senha" na linha de `PessoasPage`, com a visibilidade espelhando a matriz de alcance (UX, não defesa)
- [x] 8.3 Criar o modal de exibição única da senha gerada, com aviso de que não será mostrada de novo e meio de copiá-la, descartando o valor ao fechar
- [x] 8.4 Tratar 403 com o aviso neutro já usado nas demais operações de pessoas
- [x] 8.5 Testes de `PessoasPage`: `unit_admin` vê a ação só em `collaborator`; `global_admin` vê em `collaborator` e `unit_admin`; nenhuma linha de `global_admin` oferece a ação; a senha some ao fechar o modal

## 9. Fechamento

- [x] 9.1 Rodar `npm run lint`, `npm run build` e `npm run test` na raiz e corrigir o que aparecer
- [x] 9.2 Conferir que `apps/api/src/__tests__/rls-isolation.test.ts`, `isolamento-unidade.test.ts` e `permission.test.ts` seguem passando — são contrato, não testes descartáveis
- [x] 9.3 Revisar os comentários de código citando US 1.3 / US 1.4 e as decisões de design correspondentes, mantendo o rastro já usado no repositório
- [x] 9.4 Registrar no runbook de operação o procedimento de recuperação manual da conta `global_admin` que perder a senha, e a recomendação de manter mais de um `global_admin` ativo (design.md — Riscos)
- [x] 9.5 Registrar na nota de deploy que a subida encerra todas as sessões vigentes, uma única vez (design.md D3)
