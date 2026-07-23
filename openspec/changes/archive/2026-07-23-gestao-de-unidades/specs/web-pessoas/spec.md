## MODIFIED Requirements

### Requirement: Página de gestão de pessoas restrita à administração

A SPA SHALL prover, em **`/admin/pessoas`**, uma página de gestão de pessoas
acessível **apenas** a `unit_admin` e `global_admin` — a mesma guarda de papel já
declarada na rota. Um `collaborator` NÃO SHALL alcançar a página (é barrado pela
guarda de rota, antes de qualquer chamada). A página SHALL listar as pessoas do
alcance do administrador via `GET /users` — para `unit_admin`, apenas as da
própria unidade (RLS) — exibindo, por pessoa, ao menos **nome** (ou e-mail quando
o nome for nulo), **e-mail**, **função/cargo**, **papel**, **status**
(ativa/inativa) e o **nome da unidade** (não o identificador cru), resolvido a
partir de `GET /units`.

Esconder a página do colaborador é **conveniência de UX**: o servidor permanece o
guardião e responde 403 nas rotas de `users` a qualquer requisição de não-admin.

Referência: PRD US 1.1, RF #1/#2/#3; design.md D1/D2.

#### Scenario: Administrador lista as pessoas do seu alcance
- **WHEN** um administrador (`unit_admin` ou `global_admin`) abre `/admin/pessoas`
- **THEN** a SPA chama `GET /users` e exibe a lista de pessoas retornada, com nome,
  e-mail, função, papel, status e o nome da unidade por linha

#### Scenario: Pessoa sem nome cai no e-mail
- **WHEN** uma pessoa da lista tem `fullName` nulo
- **THEN** a SPA exibe o `email` dessa pessoa no lugar do nome

#### Scenario: Unidade exibida pelo nome, não pelo identificador
- **WHEN** a listagem de pessoas é exibida
- **THEN** cada pessoa mostra o nome da sua unidade, não o identificador (UUID) cru

#### Scenario: Colaborador não acessa a página
- **WHEN** um `collaborator` tenta navegar para `/admin/pessoas`
- **THEN** a SPA não exibe a gestão de pessoas (a guarda de papel bloqueia a rota)

### Requirement: Cadastro de pessoa com senha inicial

A página SHALL oferecer uma ação **"Nova pessoa"** que abre um formulário e, ao
confirmar, chama **`POST /users`** com nome, e-mail, **senha inicial**, e os
campos opcionais telefone, função/cargo, área de trabalho, observação e papel. Em
sucesso, a pessoa passa a poder fazer login com as credenciais definidas; a SPA
SHALL fechar o formulário e refletir a nova pessoa na listagem (invalidando a
consulta de `GET /users`).

A seleção da unidade SHALL depender do papel do administrador logado:

- Para **`global_admin`**, o formulário SHALL apresentar um **seletor de unidade**,
  alimentado por `GET /units` (apenas unidades **ativas**), e SHALL enviar o
  `unitId` escolhido no `POST /users`.
- Para **`unit_admin`**, o formulário NÃO SHALL apresentar seletor de unidade nem
  enviar `unitId` — a pessoa é criada na unidade do próprio administrador (o
  servidor força `ctx.unitId`, mantendo o comportamento atual).

O servidor permanece o guardião: ainda que um `unit_admin` forjasse `unitId`, o
cadastro é forçado à sua própria unidade.

Referência: PRD US 1.1 (cenário 1); design.md (gestao-de-unidades) D7.

#### Scenario: Cadastro válido por global_admin com seletor de unidade
- **WHEN** um `global_admin` preenche nome, e-mail ainda não utilizado, senha, os
  demais dados e **seleciona uma unidade ativa**, e confirma
- **THEN** a SPA chama `POST /users` enviando o `unitId` escolhido, fecha o
  formulário e a nova pessoa aparece na listagem vinculada àquela unidade

#### Scenario: Cadastro por unit_admin não mostra seletor de unidade
- **WHEN** um `unit_admin` abre o formulário de "Nova pessoa"
- **THEN** o formulário não apresenta seletor de unidade e o cadastro é criado na
  unidade do próprio administrador

#### Scenario: Senha é exigida no cadastro
- **WHEN** o administrador tenta confirmar o cadastro sem informar a senha
- **THEN** a SPA impede o envio e sinaliza que a senha é obrigatória
