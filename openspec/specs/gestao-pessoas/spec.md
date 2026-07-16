# gestao-pessoas Specification

## Purpose

Define os requisitos verificáveis da gestão de pessoas do GDoc pela
administração — cadastro, alcance por papel (`global_admin` vs.
`unit_admin`), edição/desativação, e o bootstrap do primeiro administrador
global. Implementa o Épico 1 / US 1.1 e o papel de administração da US 5.1
(alcance por unidade) do PRD (`docs/prd_final.md`); os cenários
Given/When/Then dessas US são vinculantes e este spec os torna verificáveis
no backend.

## Requirements

### Requirement: Cadastro de pessoa pela administração

O sistema SHALL permitir que uma pessoa autenticada com papel de administração
cadastre outra pessoa em `POST /users`, informando nome, unidade, telefone, e-mail,
função/cargo, área de trabalho e observação, e uma senha inicial; a conta criada
SHALL ficar vinculada à unidade e apta a fazer login. NÃO SHALL existir autocadastro
nem convite por e-mail. Referência: PRD US 1.1.

#### Scenario: Cadastro válido cria conta apta a login

- **WHEN** um administrador cadastra uma pessoa com os campos exigidos e um e-mail
  ainda não utilizado
- **THEN** a conta é criada vinculada à unidade informada, com a senha armazenada
  apenas como hash, e a pessoa passa a poder autenticar-se

#### Scenario: E-mail duplicado é recusado

- **WHEN** um administrador tenta cadastrar uma pessoa com um e-mail já em uso
- **THEN** o cadastro é recusado com mensagem indicando que o e-mail já está em uso,
  e nenhuma conta é criada

#### Scenario: Colaborador não pode cadastrar pessoas

- **WHEN** uma pessoa com papel `collaborator` chama `POST /users`
- **THEN** a ação é bloqueada com resposta de permissão insuficiente

### Requirement: Alcance da gestão por papel

O sistema SHALL restringir a gestão de pessoas ao alcance do administrador:
`global_admin` gerencia pessoas de qualquer unidade; `unit_admin` gerencia somente
pessoas da própria unidade e NÃO SHALL enxergar, criar ou alterar pessoas de outra
unidade — isolamento imposto no banco por RLS, não apenas na aplicação. Referência:
PRD US 5.1.

#### Scenario: Listagem restrita ao alcance

- **WHEN** um `unit_admin` lista pessoas em `GET /users`
- **THEN** vê apenas pessoas da sua própria unidade, nunca de outras

#### Scenario: unit_admin não cria fora da própria unidade nem eleva papel

- **WHEN** um `unit_admin` tenta criar uma pessoa em outra unidade ou com papel
  `global_admin`
- **THEN** a criação é forçada à sua própria unidade e o papel elevado é recusado

#### Scenario: global_admin agrega todas as unidades

- **WHEN** um `global_admin` lista pessoas
- **THEN** vê pessoas de todas as unidades, dentro do seu alcance global

### Requirement: Edição e desativação de pessoa

O sistema SHALL permitir que a administração edite os dados de uma pessoa e altere
seu status para ativo/desativado em `PATCH /users/:id`, dentro do seu alcance. Uma
pessoa desativada NÃO SHALL conseguir autenticar-se (ver capability `autenticacao`),
mas seus arquivos e registros de auditoria SHALL ser preservados.

#### Scenario: Desativação impede novo login preservando dados

- **WHEN** um administrador desativa uma pessoa
- **THEN** a pessoa deixa de conseguir autenticar-se, e seus arquivos e registros de
  auditoria permanecem intactos

#### Scenario: Edição respeita o alcance

- **WHEN** um `unit_admin` tenta editar uma pessoa de outra unidade
- **THEN** a operação é negada (a RLS não expõe a linha), sem alterar dado algum

### Requirement: Bootstrap do primeiro administrador global

O sistema SHALL prover um mecanismo de seed idempotente que cria um `global_admin`
inicial quando nenhum existir, de modo que a primeira administração possa entrar e
cadastrar as demais pessoas. O seed NÃO SHALL criar um segundo administrador se já
houver `global_admin`.

#### Scenario: Seed cria o primeiro admin apenas uma vez

- **WHEN** o seed roda em um banco sem nenhum `global_admin`
- **THEN** um `global_admin` inicial é criado com senha apenas em hash

#### Scenario: Seed é no-op quando já há administrador

- **WHEN** o seed roda novamente com um `global_admin` já existente
- **THEN** nenhuma conta adicional é criada
