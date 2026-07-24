## MODIFIED Requirements

### Requirement: Cadastro de pessoa pela administração

O sistema SHALL permitir que uma pessoa autenticada com papel de administração
cadastre outra pessoa em `POST /users`, informando nome, unidade, telefone, e-mail,
função/cargo, área de trabalho e observação, e uma senha inicial; a conta criada
SHALL ficar vinculada à unidade e apta a fazer login. NÃO SHALL existir autocadastro
nem convite por e-mail. A unidade de destino SHALL estar **ativa**: o sistema SHALL
recusar (fail-closed) o cadastro em uma unidade com status desativado, sem criar a
conta. A senha inicial SHALL atender ao tamanho mínimo da política de senha (ver
capability `troca-de-senha`): senha mais curta SHALL recusar o cadastro sem criar a
conta. Referência: PRD US 1.1; design.md (gestao-de-unidades) D5/D7; design.md
(troca-de-senha) D8.

#### Scenario: Cadastro válido cria conta apta a login

- **WHEN** um administrador cadastra uma pessoa com os campos exigidos e um e-mail
  ainda não utilizado, em uma unidade ativa
- **THEN** a conta é criada vinculada à unidade informada, com a senha armazenada
  apenas como hash, e a pessoa passa a poder autenticar-se

#### Scenario: E-mail duplicado é recusado

- **WHEN** um administrador tenta cadastrar uma pessoa com um e-mail já em uso
- **THEN** o cadastro é recusado com mensagem indicando que o e-mail já está em uso,
  e nenhuma conta é criada

#### Scenario: Colaborador não pode cadastrar pessoas

- **WHEN** uma pessoa com papel `collaborator` chama `POST /users`
- **THEN** a ação é bloqueada com resposta de permissão insuficiente

#### Scenario: Cadastro em unidade desativada é recusado

- **WHEN** um `global_admin` tenta cadastrar uma pessoa informando uma unidade com
  status desativado
- **THEN** o cadastro é recusado (fail-closed) e nenhuma conta é criada

#### Scenario: Senha inicial curta é recusada

- **WHEN** um administrador tenta cadastrar uma pessoa com senha inicial menor que o
  tamanho mínimo exigido
- **THEN** o cadastro é recusado indicando o requisito não atendido, e nenhuma conta
  é criada

### Requirement: Edição e desativação de pessoa

O sistema SHALL permitir que a administração edite os dados de uma pessoa e altere
seu status para ativo/desativado em `PATCH /users/:id`, dentro do seu alcance. Uma
pessoa desativada NÃO SHALL conseguir autenticar-se (ver capability `autenticacao`),
mas seus arquivos e registros de auditoria SHALL ser preservados.

O alcance SHALL considerar o papel da **pessoa alvo**, lido do banco, e não apenas o
papel informado na requisição: um `unit_admin` NÃO SHALL editar nem alterar o status
de um `unit_admin` ou de um `global_admin`, ainda que a RLS lhe exponha a linha por
estar na sua própria unidade; um `global_admin` NÃO SHALL ser editado por quem não
seja `global_admin`. Alvo fora do alcance SHALL ser recusado com permissão
insuficiente, sem distinguir o subcaso de alvo inexistente ou escondido pela RLS.
Referência: PRD US 5.1; design.md (troca-de-senha) D5.

#### Scenario: Desativação impede novo login preservando dados

- **WHEN** um administrador desativa uma pessoa
- **THEN** a pessoa deixa de conseguir autenticar-se, e seus arquivos e registros de
  auditoria permanecem intactos

#### Scenario: Edição respeita o alcance

- **WHEN** um `unit_admin` tenta editar uma pessoa de outra unidade
- **THEN** a operação é negada (a RLS não expõe a linha), sem alterar dado algum

#### Scenario: unit_admin não edita nem desativa administrador da própria unidade

- **WHEN** um `unit_admin` tenta editar ou desativar um `unit_admin` ou um
  `global_admin` lotado na sua própria unidade
- **THEN** a operação é recusada com permissão insuficiente, sem alterar dado algum

## ADDED Requirements

### Requirement: Rota de redefinição administrativa de senha

O sistema SHALL expor `POST /users/:id/password` sob as mesmas garantias das demais
rotas de gestão de pessoas — sessão obrigatória, contexto de tenant por transação e
RLS de `users` como fronteira de isolamento entre unidades. O comportamento da
redefinição (geração da senha, exibição única e alcance por papel do alvo) é
definido na capability `troca-de-senha`. Referência: PRD US 1.4.

#### Scenario: Redefinição roda sob o contexto de tenant da requisição

- **WHEN** um administrador chama `POST /users/:id/password`
- **THEN** a operação executa dentro de uma transação com `SET LOCAL` do contexto
  resolvido, com a RLS restringindo as linhas alcançáveis
