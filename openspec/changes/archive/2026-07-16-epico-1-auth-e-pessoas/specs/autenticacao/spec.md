# Spec — autenticacao (delta)

Capability nova. Implementa o Épico 1 / **US 1.2** do PRD
(`docs/prd_final.md`). Os cenários Given/When/Then da US 1.2 são vinculantes;
os requisitos abaixo os tornam verificáveis no backend sem os re-descrever.

## ADDED Requirements

### Requirement: Autenticação por usuário e senha

O sistema SHALL autenticar uma pessoa por e-mail e senha em `POST /auth/login`,
verificando a senha contra o hash argon2 armazenado, e SHALL emitir uma sessão
apenas quando a conta existir, a senha conferir e a conta estiver ativa. Referência:
PRD US 1.2.

#### Scenario: Login válido emite sessão
- **WHEN** uma pessoa com conta ativa envia e-mail e senha corretos
- **THEN** o sistema responde com sucesso e estabelece uma sessão autenticada
  (cookie `HttpOnly`), e as requisições seguintes são reconhecidas como dessa
  pessoa

#### Scenario: Credenciais inválidas não revelam a causa
- **WHEN** o e-mail não existe **ou** a senha está incorreta
- **THEN** o sistema nega o acesso com uma resposta única e genérica, sem indicar se
  o problema foi o usuário ou a senha, e nenhuma sessão é emitida

#### Scenario: Conta desativada não autentica
- **WHEN** a pessoa tem `status = 'disabled'` e envia credenciais corretas
- **THEN** o acesso é negado com aviso de conta indisponível e nenhuma sessão é
  emitida

### Requirement: Segredo de sessão sempre via SecretsPort

O sistema SHALL assinar e verificar a sessão usando `AUTH_SESSION_SECRET` obtido
através do `SecretsPort` (Secret Manager em produção, `.env` em desenvolvimento), e
SHALL NEVER ler esse segredo diretamente de `process.env` na lógica de negócio.

#### Scenario: Origem do segredo por ambiente
- **WHEN** a API emite ou verifica uma sessão em produção
- **THEN** o segredo é resolvido pelo `SecretsPort` a partir do Secret Manager, sem
  qualquer chave de sessão embutida no código ou lida direto do ambiente pela rota

### Requirement: Identidade autenticada alimenta o contexto de tenant

O sistema SHALL resolver a identidade da requisição a partir da sessão autenticada
(substituindo o header placeholder `x-gdoc-user-id`) e SHALL popular o contexto de
tenant relendo `unit_id`, papel e status da pessoa no banco a cada requisição,
mantendo o mecanismo de `SET LOCAL app.current_unit` / `app.user_role` por
transação. Uma sessão válida cujo dono foi desativado ou removido SHALL ser
recusada.

#### Scenario: Requisição autenticada abre transação com contexto correto
- **WHEN** uma requisição a uma rota protegida chega com sessão válida de uma pessoa
  ativa
- **THEN** o sistema resolve `unit_id` e papel do banco e executa a operação sob
  `SET LOCAL` desse contexto (nunca `SET` de sessão), com a RLS como fronteira real

#### Scenario: Sessão válida de conta desativada é recusada
- **WHEN** chega uma requisição com sessão ainda não expirada, porém o dono foi
  desativado após a emissão
- **THEN** o acesso é negado na revalidação por requisição, sem depender de expirar
  o token

#### Scenario: Requisição sem sessão é rejeitada
- **WHEN** uma rota protegida é acessada sem sessão válida
- **THEN** o sistema responde não autenticado e não executa a operação

### Requirement: Encerramento de sessão

O sistema SHALL expor `POST /auth/logout` que encerra a sessão corrente, e `GET
/auth/me` que devolve a identidade autenticada (id, unidade, papel) da requisição.

#### Scenario: Logout encerra a sessão
- **WHEN** uma pessoa autenticada chama `POST /auth/logout`
- **THEN** a sessão é encerrada (cookie limpo) e requisições seguintes a rotas
  protegidas são tratadas como não autenticadas

#### Scenario: Consulta da própria identidade
- **WHEN** uma pessoa autenticada chama `GET /auth/me`
- **THEN** o sistema devolve seu id, unidade e papel, sem expor senha ou hash
