## MODIFIED Requirements

### Requirement: Identidade autenticada alimenta o contexto de tenant

O sistema SHALL resolver a identidade da requisição a partir da sessão autenticada
(substituindo o header placeholder `x-gdoc-user-id`) e SHALL popular o contexto de
tenant relendo `unit_id`, papel e status da pessoa no banco a cada requisição,
mantendo o mecanismo de `SET LOCAL app.current_unit` / `app.user_role` por
transação. Uma sessão válida cujo dono foi desativado ou removido SHALL ser
recusada.

A sessão emitida SHALL registrar o **instante de sua emissão**, e a mesma releitura
por requisição SHALL trazer o instante da última mudança de senha da pessoa: uma
sessão emitida **antes** dessa mudança SHALL ser recusada, no mesmo ponto em que se
recusa a sessão de conta desativada. Uma sessão que não registre seu instante de
emissão SHALL ser tratada como inválida (fail-closed). Referência: design.md
(troca-de-senha) D1/D3.

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

#### Scenario: Sessão anterior à última mudança de senha é recusada

- **WHEN** chega uma requisição com sessão ainda não expirada, porém emitida antes
  da última mudança de senha do seu dono
- **THEN** o acesso é negado na revalidação por requisição, sem depender de expirar
  o token e sem consultar qualquer registro de sessão no servidor

#### Scenario: Sessão sem instante de emissão é recusada

- **WHEN** chega uma requisição com sessão cujo formato não registra o instante de
  emissão
- **THEN** a sessão é tratada como inválida e o acesso é negado

#### Scenario: Requisição sem sessão é rejeitada

- **WHEN** uma rota protegida é acessada sem sessão válida
- **THEN** o sistema responde não autenticado e não executa a operação
