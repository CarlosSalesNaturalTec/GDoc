## Context

A senha vive hoje em `users.password_hash` (argon2id via `Argon2AuthPort`) e é escrita **num único lugar**: o `INSERT` de `POST /users` (`routes/users.ts:107`). Não há caminho de escrita depois disso.

A sessão é um JWT HMAC-SHA256 **stateless**, com payload `{ sub, exp }` e sem lista de revogação (`adapters/argon2-auth-port.ts:47`). Não existe tabela de sessões. O que hoje permite cortar acesso na hora — desativar uma conta — funciona porque `attachTenantContext` **relê a pessoa do banco a cada requisição** (`middleware/tenant-context.ts:53`) em vez de confiar no token. Essa releitura por requisição é a costura em que esta fatia se apoia: o custo de checar mais uma coluna ali é marginal.

O isolamento por unidade permanece com sua fronteira real na RLS: `users` já tem `unit_id` e policy (`0002_enable_rls.sql`), e toda operação desta fatia roda dentro de `withTenantTransaction`. As travas de papel descritas abaixo são a **segunda** camada, nunca a única.

Restrições vindas do PRD e das decisões já fechadas: sem envio de e-mail (logo, sem recuperação por link), sem troca obrigatória no primeiro acesso, e senha de `global_admin` fora do alcance de qualquer redefinição administrativa.

## Goals / Non-Goals

**Goals:**

- Dar a cada pessoa a posse exclusiva da própria credencial, com alteração autônoma (US 1.3).
- Devolver acesso a quem esqueceu a senha, sem que isso vire um vetor de escalada de privilégio (US 1.4).
- Fazer com que trocar a senha **signifique** algo: encerrar os acessos já abertos, sem introduzir estado de sessão no servidor.
- Fechar, de passagem, a brecha de alvo que já existe no `PATCH /users/:id` — não apenas evitar reabri-la na rota nova.

**Non-Goals:**

- Auditar as trocas de senha (fora de escopo — `audit_events` é centrada em arquivo).
- Tabela de sessões, revogação individual de dispositivo ou listagem de sessões ativas.
- Expiração periódica de senha, histórico de senhas anteriores, bloqueio por tentativas, regras de complexidade além de tamanho.
- Autoedição de dados cadastrais em "Minha conta" — segue sendo atribuição da administração (US 1.1).

## Decisions

### D1 — Invalidação de sessão por marca temporal, não por tabela de sessões

`users` ganha `password_changed_at timestamptz NOT NULL`; o token passa a carregar `iat` (instante de emissão) além de `sub`/`exp`. Na revalidação por requisição, `iat < password_changed_at` ⇒ `401`, no **mesmo ponto** em que hoje se recusa a sessão de conta desativada.

*Alternativas consideradas:* (a) **tabela de sessões** com revogação por linha — dá revogação granular e listagem de dispositivos, ao custo de escrita por login, expurgo, e de transformar um token stateless em consulta de estado; nenhum requisito desta fatia pede granularidade por dispositivo. (b) **rotacionar o segredo HMAC** — derruba *todo mundo*, não a pessoa. (c) **derivar do próprio `password_hash`** (por exemplo, assinar o token com uma chave que inclua o hash) — invalida sem coluna nova, mas acopla o formato do token ao algoritmo de hash e quebra na rotação de parâmetros do argon2.

O `SELECT` da releitura já existe e já roda por requisição: a coluna entra nele sem query adicional.

### D2 — O `iat` do token reemitido vem do banco, não do relógio do Node

Na alteração da própria senha, a sessão atual precisa **sobreviver** (US 1.3, cenário 1). Reemitimos o cookie ao final da operação — mas `password_changed_at` é gravado com o `now()` do **Postgres** e o `iat` seria calculado com o `Date.now()` do **Node**, truncado em segundos. Basta um segundo de defasagem, ou o truncamento, para o token recém-emitido nascer com `iat < password_changed_at` e a pessoa ser deslogada **pela própria ação de trocar a senha** — falha intermitente, dependente de relógio, e desagradável de diagnosticar.

Decisão: o `UPDATE ... RETURNING password_changed_at` devolve o instante gravado, e é **esse** valor que alimenta o `iat` do token reemitido. Uma única fonte de tempo, sem tolerância arbitrária.

*Alternativa considerada:* comparar com folga (`iat + 5s >= password_changed_at`). Rejeitada: uma janela de tolerância é exatamente uma janela em que um token antigo continua aceito — pequena, mas gratuita, já que existe solução exata.

### D3 — Token sem `iat` é inválido (fail-closed), e o deploy encerra as sessões vigentes

Sessões emitidas antes deste deploy não têm `iat`. `verifySession` passa a exigir o campo: ausência ⇒ token inválido ⇒ `401` ⇒ nova autenticação.

*Alternativa considerada:* tratar ausência como `iat = 0`. Rejeitada — não muda o efeito prático (com o backfill de D4 qualquer token legado seria recusado de qualquer forma) e deixa no código um ramo que aceita token de formato antigo, que ninguém vai lembrar de remover.

Consequência operacional a comunicar: **todas as pessoas autenticadas precisam entrar de novo após o deploy**, uma vez. Não há perda de dado; é uma janela de login.

### D4 — Backfill de `password_changed_at` com `created_at`

A coluna nasce com `DEFAULT now()`, mas as linhas existentes recebem `password_changed_at = created_at` — o instante em que a senha vigente passou a existir. Semanticamente correto, e evita que a coluna registre "a senha mudou na hora da migration", o que seria falso.

### D5 — Alcance da redefinição decidido pelo **papel do alvo**, em uma regra única

| ator ↓ / alvo → | `collaborator` | `unit_admin` | `global_admin` |
|---|---|---|---|
| `unit_admin` | ✅ (RLS restringe à própria unidade) | ❌ | ❌ |
| `global_admin` | ✅ | ✅ | ❌ |

A regra mora numa função só, aplicada tanto ao `POST /users/:id/password` quanto ao `PATCH /users/:id`. A checagem lê o papel **da linha do alvo lida do banco na mesma transação**, nunca um papel vindo do corpo da requisição.

O motivo de a regra cobrir também o `PATCH`: a trava existente lá só barra *promover* alguém a `global_admin` (`routes/users.ts:175`), enquanto a RLS deixa um `unit_admin` **enxergar** um `global_admin` lotado na própria unidade. Hoje isso já permite desativá-lo via `PATCH { status }`. Corrigir só a rota nova deixaria a brecha aberta ao lado dela.

*Sobre o teto do `global_admin`:* nenhuma redefinição administrativa alcança um `global_admin`, nem por outro `global_admin` — decisão do PRD US 1.4, cenário 2. O preço está em D-Riscos.

### D6 — `GET /auth/profile`, não `GET /me/profile`

O perfil de "Minha conta" precisa de nome, e-mail, nome da unidade e papel — dados que `GET /auth/me` não devolve (só `id`/`unitId`/`role`, e seu DTO `AuthenticatedIdentity` é **compartilhado com a resposta do login**, então inchá-lo obrigaria o login a carregar dados que ele não usa).

Rota nova, portanto — mas sob `/auth`, que já é prefixo conhecido. Um `/me` de topo criaria um quarto ponto de sincronização de prefixos (`lib/api-prefixes.ts` ↔ `apps/web/vite.config.ts` ↔ `infra/terraform/locals.tf`), com risco de o fallback de `index.html` sombrear a rota em produção. Prefixo novo só quando houver ganho que pague esse acoplamento; aqui não há.

### D7 — A senha do reset é gerada pelo sistema, e trafega uma única vez

A API gera a senha, devolve em texto claro **apenas** na resposta do `POST /users/:id/password`, e persiste só o hash. Ela não pode aparecer em log de aplicação, em mensagem de erro, nem sobreviver no cache do TanStack Query no cliente — a mutação de reset entrega o valor direto ao modal, sem chave de cache.

Alfabeto sem caracteres ambíguos (`0`/`O`, `1`/`l`/`I`), porque essa senha será **transcrita por uma pessoa para outra** fora do sistema; ambiguidade vira chamado de suporte. Comprimento fixo, acima do mínimo da política. Geração por CSPRNG (`node:crypto`), nunca `Math.random`.

*Alternativa considerada:* o administrador digitar a senha, como faz hoje no cadastro. Rejeitada pelo usuário — sem troca obrigatória no primeiro acesso, o administrador tenderia a reaplicar um padrão conhecido para todo mundo.

### D8 — Política de senha: só tamanho mínimo, definida em `packages/shared`

Hoje não há política alguma: `routes/users.ts:67` valida presença, e uma senha de um caractere é aceita. Passa a existir um mínimo de comprimento, validado **na API** (cadastro, troca e geração) e espelhado pela SPA apenas para dar retorno imediato — nunca como a validação de verdade.

A constante vive em `packages/shared` para que a mensagem exibida e a regra aplicada não divirjam. Sem exigência de classes de caracteres: comprimento é o que efetivamente rende, e regras de complexidade empurram para padrões previsíveis.

Senhas existentes abaixo do mínimo não são invalidadas — a política vale na entrada, não retroativamente; forçar o contrário travaria o login de quem foi cadastrado antes.

### D9 — "Senha atual incorreta" é um erro específico

O login responde genericamente de propósito (US 1.2, cenário 2): ali o solicitante é anônimo e a resposta não pode dizer se o e-mail existe. Na troca, quem chama **já está autenticado como a pessoa** — não há enumeração a impedir, e omitir a causa só produz um formulário que falha sem explicar. Erro específico, portanto, sem contradizer a US 1.2.

## Risks / Trade-offs

- **O deploy desloga todas as pessoas autenticadas (D3)** → Efeito único, sem perda de dado. Combinar a janela e avisar antes; a tela de login já trata sessão ausente sem erro ruidoso.
- **`global_admin` que esquecer a senha perde a conta** → Não há caminho pela aplicação (decisão do PRD), e `npm run bootstrap` **não** socorre: é no-op quando já existe qualquer `global_admin` (`db/bootstrap.ts:73`). A saída é `UPDATE` manual no Cloud SQL com um hash gerado à parte. Mitigação: manter mais de um `global_admin` ativo e registrar o procedimento no runbook de operação. Este é o risco mais afiado da fatia e é assumido conscientemente.
- **Entre o reset e uma troca voluntária, o administrador conhece a senha da pessoa** → Consequência direta de não haver troca obrigatória no primeiro acesso. Mitigado parcialmente pelo fato de a senha ser gerada (D7) e de "Minha conta" estar sempre disponível. Aceito.
- **A senha gerada vaza por um canal indireto** (log de acesso com corpo da resposta, cache do cliente, print de tela) → Requisito explícito na spec, não cuidado tácito; teste cobrindo que a resposta não é armazenada em cache no cliente.
- **A trava de papel do alvo passa a valer no `PATCH`, alterando comportamento existente** → Um `unit_admin` que hoje consegue editar/desativar um `global_admin` da própria unidade deixará de conseguir. É correção de segurança, não regressão, mas muda comportamento observável e precisa estar na spec de `gestao-pessoas`, não apenas no código.
- **`SessionClaims` ganha campo obrigatório** → Assinatura de porta alterada: todo ponto que emite ou verifica sessão (incluindo testes que forjam token) acompanha. Falha em `tsc`, não em runtime — o compilador é a rede de proteção aqui.
- **Argon2 no reset e na troca é deliberadamente caro** → São operações raras e autenticadas; sem impacto de carga esperado. Não introduzir cache de hash sob nenhuma justificativa de latência.

## Migration Plan

1. Migration `0012` adiciona `users.password_changed_at` com `DEFAULT now()` e faz o backfill com `created_at` (D4). Coluna aditiva, sem reescrita de dado sensível — segura de aplicar antes do código novo.
2. Deploy da API. A partir daqui, tokens sem `iat` são recusados (D3): as sessões vigentes caem e as pessoas reautenticam. A SPA já trata `401` global encerrando a sessão no cliente (`session-context.tsx`), então o efeito visível é ser levado à tela de login.
3. Deploy da SPA (mesma imagem/origem da API na fase atual).

**Rollback:** reverter a imagem da API. A coluna pode permanecer — a versão anterior a ignora, e nenhum código antigo depende da sua ausência. Os tokens emitidos pela versão nova continuam válidos na antiga (que ignora `iat`), então o rollback **não** provoca um segundo logout em massa. Reverter a migration é desnecessário e só seria feito se a coluna precisasse sair por outro motivo.
