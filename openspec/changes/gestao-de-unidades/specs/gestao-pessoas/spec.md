## MODIFIED Requirements

### Requirement: Cadastro de pessoa pela administração

O sistema SHALL permitir que uma pessoa autenticada com papel de administração
cadastre outra pessoa em `POST /users`, informando nome, unidade, telefone, e-mail,
função/cargo, área de trabalho e observação, e uma senha inicial; a conta criada
SHALL ficar vinculada à unidade e apta a fazer login. NÃO SHALL existir autocadastro
nem convite por e-mail. A unidade de destino SHALL estar **ativa**: o sistema SHALL
recusar (fail-closed) o cadastro em uma unidade com status desativado, sem criar a
conta. Referência: PRD US 1.1; design.md (gestao-de-unidades) D5/D7.

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
