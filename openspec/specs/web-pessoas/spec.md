# web-pessoas Specification

## Purpose

Define os requisitos verificáveis da gestão de pessoas pela administração na
SPA do GDoc — a página **`/admin/pessoas`**, restrita a `unit_admin`/
`global_admin`, com a listagem de pessoas do alcance do administrador
(`GET /users`), o cadastro com senha inicial (`POST /users`) e o aviso de
e-mail duplicado, a edição de perfil/papel/status (`PATCH /users/:id`), a
ativação/desativação de conta sem exclusão, as travas de papel espelhadas na
UI (sem função de linha de defesa) e o tratamento fail-closed neutro do 403.
Implementa o lado de frontend da **US 1.1** (e o cenário 3 da US 1.2, quanto à
desativação) do PRD (`docs/prd_final.md`), consumindo as rotas admin-only já
entregues pelo backend do Épico 1 (spec `gestao-pessoas`), sem re-descrever
seus cenários — o servidor permanece o único guardião de permissão.

## Requirements

### Requirement: Página de gestão de pessoas restrita à administração

A SPA SHALL prover, em **`/admin/pessoas`**, uma página de gestão de pessoas
acessível **apenas** a `unit_admin` e `global_admin` — a mesma guarda de papel já
declarada na rota. Um `collaborator` NÃO SHALL alcançar a página (é barrado pela
guarda de rota, antes de qualquer chamada). A página SHALL listar as pessoas do
alcance do administrador via `GET /users` — para `unit_admin`, apenas as da
própria unidade (RLS) — exibindo, por pessoa, ao menos **nome** (ou e-mail quando
o nome for nulo), **e-mail**, **função/cargo**, **papel** e **status**
(ativa/inativa).

Esconder a página do colaborador é **conveniência de UX**: o servidor permanece o
guardião e responde 403 nas rotas de `users` a qualquer requisição de não-admin.

Referência: PRD US 1.1, RF #1/#2/#3; design.md D1/D2.

#### Scenario: Administrador lista as pessoas do seu alcance
- **WHEN** um administrador (`unit_admin` ou `global_admin`) abre `/admin/pessoas`
- **THEN** a SPA chama `GET /users` e exibe a lista de pessoas retornada, com nome,
  e-mail, função, papel e status por linha

#### Scenario: Pessoa sem nome cai no e-mail
- **WHEN** uma pessoa da lista tem `fullName` nulo
- **THEN** a SPA exibe o `email` dessa pessoa no lugar do nome

#### Scenario: Colaborador não acessa a página
- **WHEN** um `collaborator` tenta navegar para `/admin/pessoas`
- **THEN** a SPA não exibe a gestão de pessoas (a guarda de papel bloqueia a rota)

### Requirement: Cadastro de pessoa com senha inicial

A página SHALL oferecer uma ação **"Nova pessoa"** que abre um formulário e, ao
confirmar, chama **`POST /users`** com nome, e-mail, **senha inicial**, e os
campos opcionais telefone, função/cargo, área de trabalho, observação e papel. Em
sucesso, a pessoa passa a poder fazer login com as credenciais definidas; a SPA
SHALL fechar o formulário e refletir a nova pessoa na listagem (invalidando a
consulta de `GET /users`). A SPA NÃO SHALL enviar `unitId` nem mostrar seletor de
unidade — a pessoa é criada na unidade do administrador logado (Opção A).

Referência: PRD US 1.1 (cenário 1); design.md D2/D3/D7.

#### Scenario: Cadastro válido (US 1.1 cenário 1)
- **WHEN** um administrador preenche nome, e-mail ainda não utilizado, senha e os
  demais dados e confirma
- **THEN** a SPA chama `POST /users`, fecha o formulário e a nova pessoa aparece na
  listagem

#### Scenario: Senha é exigida no cadastro
- **WHEN** o administrador tenta confirmar o cadastro sem informar a senha
- **THEN** a SPA impede o envio e sinaliza que a senha é obrigatória

### Requirement: E-mail duplicado recusa o cadastro sem perder o preenchimento

Quando `POST /users` retornar **409** (e-mail já em uso), a SPA SHALL exibir uma
mensagem clara indicando que **o e-mail já está em uso**, associada ao campo de
e-mail, e SHALL **manter o formulário aberto** com os demais campos preenchidos —
o administrador corrige apenas o e-mail e reenvia. A SPA NÃO SHALL tratar o 409
como falha genérica nem descartar o que foi digitado.

Referência: PRD US 1.1 (cenário 2); design.md D6.

#### Scenario: E-mail duplicado (US 1.1 cenário 2)
- **WHEN** o administrador confirma o cadastro com um e-mail que já pertence a
  outra conta e `POST /users` retorna 409
- **THEN** a SPA exibe "e-mail já está em uso" e mantém o formulário aberto com os
  demais campos preenchidos

### Requirement: Edição de perfil, papel e status da pessoa

A página SHALL oferecer, por linha, uma ação **"Editar"** que abre o mesmo
formulário pré-preenchido e, ao confirmar, chama **`PATCH /users/:id`** com os
campos de perfil (nome, telefone, função, área, observação), o **papel** e o
**status**. O e-mail NÃO SHALL ser editável (o endpoint não o altera) e o
formulário de edição NÃO SHALL conter campo de senha (o endpoint não aceita
`password`). Em sucesso, a SPA SHALL refletir as alterações na listagem
(invalidando `GET /users`).

Referência: PRD US 1.1; design.md D3/D7.

#### Scenario: Edição altera os dados da pessoa
- **WHEN** um administrador edita nome/função/papel/status de uma pessoa e confirma
- **THEN** a SPA chama `PATCH /users/:id` e a listagem reflete os novos valores

#### Scenario: Edição não expõe troca de senha nem de e-mail
- **WHEN** o administrador abre o formulário de edição de uma pessoa
- **THEN** o formulário não apresenta campo de senha e o e-mail aparece como
  somente-leitura

### Requirement: Ativar e desativar conta sem exclusão

A página SHALL oferecer, por linha, a ação de **desativar** uma conta ativa e de
**ativar** uma conta inativa, ambas via **`PATCH /users/:id`** com o `status`
correspondente (`disabled`/`active`), com **confirmação** antes de desativar. NÃO
SHALL existir ação de exclusão permanente de pessoa (não há endpoint) — desativar
preserva os arquivos e a auditoria e apenas bloqueia o login. Em sucesso, a SPA
SHALL refletir o novo status na listagem.

Referência: PRD US 1.1, US 1.2 (cenário 3); design.md D5.

#### Scenario: Desativar bloqueia o login preservando dados
- **WHEN** um administrador desativa uma pessoa e confirma
- **THEN** a SPA chama `PATCH /users/:id` com `status: 'disabled'` e a listagem
  passa a exibir a pessoa como inativa

#### Scenario: Reativar restaura o acesso
- **WHEN** um administrador ativa uma pessoa inativa
- **THEN** a SPA chama `PATCH /users/:id` com `status: 'active'` e a listagem passa
  a exibir a pessoa como ativa

#### Scenario: Não há exclusão permanente
- **WHEN** o administrador vê as ações disponíveis para uma pessoa
- **THEN** a SPA não oferece exclusão permanente, apenas ativar/desativar

### Requirement: Travas de papel espelhadas na UI, com o servidor como guardião

A SPA SHALL espelhar as travas de papel do servidor como conveniência de UX, sem
tratá-las como linha de defesa:

- No seletor de papel, a opção **`global_admin`** SHALL aparecer **apenas** quando
  o administrador logado for `global_admin`; para `unit_admin` as opções SHALL se
  limitar a `collaborator` e `unit_admin` (o servidor recusa a criação/elevação a
  `global_admin` por `unit_admin` com 403).
- Na **própria linha** do administrador logado (`row.id === identity.id`), a SPA
  NÃO SHALL oferecer as ações de **desativar** a si mesmo nem de **rebaixar** o
  próprio papel — evitando que o administrador corte o próprio acesso.

Estas travas são **UX, não defesa**: o servidor (`isAdmin`, as checagens de papel
e a RLS por `unit_id`) permanece o único guardião e SHALL ser sempre quem
autoriza; a SPA NÃO SHALL inferir permissão a partir da visibilidade das opções.

Referência: PRD US 1.1; design.md D4/D5.

#### Scenario: unit_admin não vê a opção global_admin
- **WHEN** um `unit_admin` abre o seletor de papel ao cadastrar ou editar uma
  pessoa
- **THEN** a SPA oferece apenas `collaborator` e `unit_admin`, sem `global_admin`

#### Scenario: global_admin vê a opção global_admin
- **WHEN** um `global_admin` abre o seletor de papel
- **THEN** a SPA oferece também a opção `global_admin`

#### Scenario: Administrador não desativa nem rebaixa a si mesmo
- **WHEN** um administrador vê a linha correspondente à própria conta
- **THEN** a SPA não oferece as ações de desativar essa conta nem de rebaixar o
  próprio papel

### Requirement: 403 fail-closed neutro nas operações de pessoas

A SPA SHALL tratar qualquer operação de pessoas que retorne **403** — por
exemplo, editar uma pessoa de outra unidade (escondida pela RLS) ou uma trava de
papel violada por um pedido forjado — exibindo um aviso de **permissão
insuficiente** neutro, **sem distinguir os subcasos** (que o servidor unifica de
propósito) e **sem** expor dados da pessoa alvo. A SPA NÃO SHALL tratar o 403 como
se o recurso não existisse de forma que vaze informação.

Referência: PRD US 1.1; design.md D6.

#### Scenario: Operação negada exibe aviso neutro
- **WHEN** uma operação de pessoas (`POST`/`PATCH /users`) retorna 403
- **THEN** a SPA exibe um aviso de permissão insuficiente, sem distinguir se a
  pessoa é de outra unidade ou se a ação foi barrada por papel, e sem expor
  dados da pessoa alvo
