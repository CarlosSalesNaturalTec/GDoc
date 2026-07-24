## Why

Hoje a senha de uma pessoa é definida **uma única vez**, pelo administrador que a cadastra (`routes/users.ts`, único ponto que chama `hashPassword`), e **nunca mais pode mudar**: não há auto-serviço, não há redefinição administrativa e `PATCH /users/:id` não toca `password_hash`. Na prática, quem cadastrou conhece a credencial da pessoa **para sempre**, e um vazamento pelo canal externo em que a senha foi combinada (mensagem, e-mail) não tem nenhuma remediação dentro do sistema — o único botão disponível é desativar a conta.

Isso enfraquece dois compromissos do PRD: o RNF de Segurança ("senhas armazenadas de forma protegida") vale só para o hash, não para a posse do segredo; e a auditoria de `view`/`download` por pessoa perde não-repúdio, já que o administrador consegue autenticar-se como qualquer pessoa que cadastrou. O PRD passa a cobrir a lacuna nas **US 1.3** (alterar a própria senha em "Minha conta") e **US 1.4** (redefinição administrativa).

## What Changes

- **Alteração da própria senha** (qualquer papel): `POST /auth/password` com senha atual + nova. A senha atual é exigida como prova de posse; erro de senha atual incorreta é **específico** (diferente da resposta genérica do login — quem chama já está autenticado como a pessoa, esconder a causa não protege nada).
- **Redefinição administrativa**: `POST /users/:id/password`, **sem** senha atual. O sistema **gera** a nova senha e a devolve **uma única vez** na resposta; o administrador não a escolhe e ela não é recuperável depois. Alcance (US 1.4, cenário 2): `unit_admin` redefine apenas `collaborator` da própria unidade; `global_admin` redefine `collaborator` e `unit_admin`; **ninguém redefine a senha de um `global_admin`** — ela só muda em "Minha conta".
- **Encerramento dos acessos abertos**: nova coluna `users.password_changed_at`; a sessão passa a carregar o instante de emissão e é recusada quando anterior à última troca. Alterar a própria senha derruba as **demais** sessões (a atual sobrevive); a redefinição administrativa derruba **todas** as do alvo, imediatamente.
- **Política de senha** (tamanho mínimo), hoje inexistente — `POST /users` valida apenas *presença* de `password`, aceitando um caractere. Passa a valer no cadastro, na troca e na geração do reset.
- **Perfil somente leitura**: `GET /auth/profile` devolve nome, e-mail, unidade (nome) e papel da pessoa autenticada, alimentando a tela "Minha conta". Rota nova sob o prefixo `/auth` **já existente**, e não sob um `/me` novo, para não criar um quarto ponto de sincronização de prefixos de API (design.md D6).
- **SPA**: nova página `/minha-conta` (dados cadastrais para consulta + formulário de troca de senha); o avatar do `AppShell` vira menu com o acesso a ela; a listagem de Pessoas ganha a ação "Redefinir senha", com a senha gerada exibida uma única vez.
- **Correção de escalada de privilégio adjacente**: as travas de papel do alvo passam a valer também para `PATCH /users/:id`. Hoje a checagem só barra *promover* alguém a `global_admin` (`users.ts:175`), enquanto a RLS deixa um `unit_admin` enxergar um `global_admin` lotado na própria unidade — o que já permite **desativá-lo** via `PATCH { status }`. Sem essa correção, a mesma brecha reapareceria no reset.

## Capabilities

### New Capabilities
- `troca-de-senha`: backend da alteração da própria senha e da redefinição administrativa — prova de posse pela senha atual, alcance por papel do alvo, geração e exibição única da senha do reset, política de tamanho mínimo, encerramento dos acessos abertos e perfil somente leitura da pessoa autenticada. Referencia PRD US 1.3 e US 1.4.
- `web-minha-conta`: tela "Minha conta" na SPA — dados cadastrais para consulta e formulário de alteração da própria senha, consumindo as rotas de `troca-de-senha`, sem ser linha de defesa.

### Modified Capabilities
- `autenticacao`: o requisito "Identidade autenticada alimenta o contexto de tenant" ganha uma condição — uma sessão emitida **antes** da última troca de senha da pessoa é recusada na revalidação por requisição, no mesmo ponto em que hoje se recusa a sessão de conta desativada. A sessão emitida passa a registrar seu instante de emissão.
- `gestao-pessoas`: o requisito de cadastro (`POST /users`) passa a **recusar** senha inicial que não atenda ao tamanho mínimo; e as travas de papel do alvo (que hoje só cobrem promoção a `global_admin`) passam a proteger também a edição de uma pessoa de papel superior.
- `web-pessoas`: a listagem ganha a ação "Redefinir senha" (visível conforme o alcance do papel) e o modal que apresenta a senha gerada uma única vez, com aviso de que ela não será exibida de novo.
- `web-shell-e-auth`: o avatar do cabeçalho passa a ser um menu com "Minha conta" e "Sair", em vez do par avatar + botão de sair.

## Impact

- **DB**: migration adicionando `users.password_changed_at` (`timestamptz NOT NULL DEFAULT now()`).
- **api**: `routes/auth.ts` (`POST /auth/password`, `GET /auth/profile`); `routes/users.ts` (`POST /users/:id/password` + trava de papel do alvo no `PATCH`); novo `lib/password-policy.ts` (validação e geração); `ports/auth-port.ts` — `SessionClaims` ganha o instante de emissão (**assinatura de porta alterada**, afeta `Argon2AuthPort` e os testes que emitem sessão); `middleware/tenant-context.ts` — o `SELECT` que já roda por requisição passa a trazer `password_changed_at` e a compará-lo. Sem novo prefixo de API: nada muda em `lib/api-prefixes.ts`, `apps/web/vite.config.ts` ou `infra/terraform/locals.tf`.
- **web**: novo módulo `conta/` (página + queries); `shell/AppShell.tsx` (menu do avatar + rota); `pessoas/PessoasPage.tsx` (ação e modal de reset); `lib/schemas.ts` (schemas das respostas novas).
- **shared**: `ChangePasswordRequest`, `ResetPasswordResponse`, `MyProfileResponse` e a constante de tamanho mínimo de senha, consumidos de `dist/`.
- **Sessões em produção**: como o formato do token passa a incluir o instante de emissão, sessões emitidas antes do deploy não têm esse campo. O tratamento desse caso é decisão de design (design.md D3) e afeta se o deploy desloga a base instalada.

## Out of Scope (mudança futura)

- **Registro das trocas de senha na auditoria**: `audit_events` tem `file_id NOT NULL` e `action` restrito a `view`/`download` — a tabela é centrada em arquivo e não comporta evento de conta. Registrar quem redefiniu a senha de quem exigiria migration e uma consulta de auditoria de outra natureza; fica para change próprio.
- **Recuperação de senha por e-mail** ("esqueci minha senha" com link): fora do escopo do MVP no PRD — o sistema não envia e-mails, e é por isso que o esquecimento é resolvido por redefinição administrativa.
- **Troca obrigatória no primeiro acesso**: decidido fora de escopo. Consequência assumida: entre a redefinição e uma eventual troca voluntária, o administrador continua conhecendo a senha da pessoa.
- **Recuperação da conta de `global_admin` que esquecer a senha**: sem caminho pela aplicação, por decisão de alcance da US 1.4. `npm run bootstrap` **não** resolve (é no-op quando já existe qualquer `global_admin`, `db/bootstrap.ts:73`) — a saída é intervenção manual no banco. Risco assumido e registrado em design.md D5.
- **Expiração periódica de senha, histórico de senhas anteriores e bloqueio por tentativas** (força bruta na troca): não fazem parte desta fatia.
