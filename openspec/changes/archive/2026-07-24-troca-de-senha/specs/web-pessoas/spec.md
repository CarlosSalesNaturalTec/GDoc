## ADDED Requirements

### Requirement: Ação de redefinir senha na listagem de pessoas

A SPA SHALL oferecer, na linha de cada pessoa da listagem, a ação **"Redefinir
senha"**, que ao ser confirmada chama `POST /users/:id/password`. A ação SHALL ser
exibida apenas quando o papel do administrador logado a alcança — `unit_admin` a vê
somente em linhas de `collaborator`; `global_admin` a vê em linhas de `collaborator`
e `unit_admin`; em linha de `global_admin` a ação NÃO SHALL ser oferecida a ninguém,
nem na própria linha (onde o caminho é "Minha conta"). Essa visibilidade é **UX, não
defesa**: o servidor permanece o único guardião, e a SPA NÃO SHALL inferir permissão
a partir da presença da ação. Referência: PRD US 1.4 (cenários 1 e 2); design.md
(troca-de-senha) D5.

#### Scenario: unit_admin vê a ação apenas em colaboradores

- **WHEN** um `unit_admin` visualiza a listagem de pessoas
- **THEN** a ação "Redefinir senha" aparece nas linhas de `collaborator` e não
  aparece nas linhas de `unit_admin` nem de `global_admin`

#### Scenario: global_admin vê a ação em colaboradores e administradores de unidade

- **WHEN** um `global_admin` visualiza a listagem de pessoas
- **THEN** a ação "Redefinir senha" aparece nas linhas de `collaborator` e
  `unit_admin`, e não aparece em nenhuma linha de `global_admin`

#### Scenario: Redefinição negada pelo servidor exibe aviso neutro

- **WHEN** a chamada de redefinição retorna permissão insuficiente
- **THEN** a SPA exibe aviso neutro de permissão insuficiente, sem distinguir os
  subcasos e sem expor dados da pessoa alvo

### Requirement: Senha gerada exibida uma única vez

A SPA SHALL apresentar a senha devolvida pela redefinição em um modal que deixa
explícito que ela **não será exibida novamente**, oferecendo meio de copiá-la para
repasse à pessoa. A SPA NÃO SHALL armazenar essa senha em cache de consulta,
armazenamento local ou estado global — o valor SHALL existir apenas no estado do
modal e SHALL ser descartado ao fechá-lo, de modo que reabrir a tela ou recarregar a
página não a recupere. A SPA NÃO SHALL registrar a senha em log do navegador.
Referência: PRD US 1.4 (cenário 1); design.md (troca-de-senha) D7.

#### Scenario: Modal apresenta a senha com aviso de exibição única

- **WHEN** a redefinição é concluída com sucesso
- **THEN** a SPA exibe a senha gerada com aviso de que não será mostrada de novo e
  meio de copiá-la

#### Scenario: Senha some ao fechar o modal

- **WHEN** o administrador fecha o modal da senha gerada
- **THEN** o valor é descartado do estado do cliente e não é recuperável ao reabrir
  a tela ou recarregar a página

## MODIFIED Requirements

### Requirement: Cadastro de pessoa com senha inicial

A página SHALL oferecer uma ação **"Nova pessoa"** que abre um formulário e, ao
confirmar, chama **`POST /users`** com nome, e-mail, **senha inicial**, e os
campos opcionais telefone, função/cargo, área de trabalho, observação e papel. Em
sucesso, a pessoa passa a poder fazer login com as credenciais definidas; a SPA
SHALL fechar o formulário e refletir a nova pessoa na listagem (invalidando a
consulta de `GET /users`).

A senha inicial SHALL respeitar o tamanho mínimo da política de senha: a SPA SHALL
sinalizar localmente o requisito não atendido antes de enviar, como conveniência de
UX, sem que isso substitua a validação do servidor.

A seleção da unidade SHALL depender do papel do administrador logado:

- Para **`global_admin`**, o formulário SHALL apresentar um **seletor de unidade**,
  alimentado por `GET /units` (apenas unidades **ativas**), e SHALL enviar o
  `unitId` escolhido no `POST /users`.
- Para **`unit_admin`**, o formulário NÃO SHALL apresentar seletor de unidade nem
  enviar `unitId` — a pessoa é criada na unidade do próprio administrador (o
  servidor força `ctx.unitId`, mantendo o comportamento atual).

O servidor permanece o guardião: ainda que um `unit_admin` forjasse `unitId`, o
cadastro é forçado à sua própria unidade.

Referência: PRD US 1.1 (cenário 1); design.md (gestao-de-unidades) D7; design.md
(troca-de-senha) D8.

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

#### Scenario: Senha inicial curta é sinalizada antes do envio
- **WHEN** o administrador informa uma senha inicial menor que o tamanho mínimo
- **THEN** a SPA sinaliza o requisito não atendido e não chama a API
