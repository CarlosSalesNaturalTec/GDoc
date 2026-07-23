## ADDED Requirements

### Requirement: Página de gestão de unidades restrita ao global_admin

A SPA SHALL prover uma página de gestão de unidades acessível **apenas** ao `global_admin`. Um `unit_admin` ou `collaborator` NÃO SHALL alcançar a página (barrado pela guarda de rota, antes de qualquer chamada). A página SHALL listar as unidades via `GET /units`, exibindo, por unidade, ao menos **nome** e **status** (ativa/desativada). Esconder a página de não-`global_admin` é conveniência de UX: o servidor permanece o guardião e responde 403 nas rotas de `/units` a qualquer não-`global_admin`. Referência: PRD US 1.1, US 5.1; design.md D1.

#### Scenario: global_admin lista as unidades

- **WHEN** um `global_admin` abre a página de gestão de unidades
- **THEN** a SPA chama `GET /units` e exibe as unidades com nome e status

#### Scenario: unit_admin não acessa a página de unidades

- **WHEN** um `unit_admin` tenta navegar para a página de unidades
- **THEN** a SPA não exibe a gestão de unidades (a guarda de papel bloqueia a rota)

### Requirement: Criar e renomear unidade pela SPA

A página SHALL oferecer uma ação de **criar unidade** (chamando `POST /units`) e, por unidade, uma ação de **renomear** (chamando `PATCH /units/:id`). Em sucesso, a SPA SHALL refletir a mudança na listagem (invalidando `GET /units`). Quando a API retornar **409** (nome já em uso), a SPA SHALL sinalizar que o nome já está em uso, associado ao campo de nome, mantendo o formulário aberto com o restante preenchido.

#### Scenario: Criar unidade com nome novo

- **WHEN** um `global_admin` cria uma unidade com um nome ainda não utilizado
- **THEN** a SPA chama `POST /units`, fecha o formulário e a unidade aparece na listagem

#### Scenario: Nome duplicado é sinalizado sem perder o preenchimento

- **WHEN** o `global_admin` confirma criar/renomear com um nome já em uso e a API retorna 409
- **THEN** a SPA exibe "nome já está em uso" no campo de nome e mantém o formulário aberto

#### Scenario: Renomear unidade

- **WHEN** um `global_admin` renomeia uma unidade para um nome novo e confirma
- **THEN** a SPA chama `PATCH /units/:id` e a listagem reflete o novo nome

### Requirement: Ativar e desativar unidade pela SPA

A página SHALL oferecer, por unidade, a ação de **desativar** uma unidade ativa e de **ativar** uma unidade desativada, ambas via `PATCH /units/:id`, com **confirmação** antes de desativar. Quando a API recusar a desativação com **409** ("unidade não está vazia") ou por ser a própria unidade / a de bootstrap, a SPA SHALL exibir um aviso claro explicando o motivo, sem alterar o estado exibido. NÃO SHALL existir ação de exclusão permanente de unidade. Referência: design.md D2/D3.

#### Scenario: Desativar unidade vazia

- **WHEN** um `global_admin` desativa uma unidade sem pessoas e confirma
- **THEN** a SPA chama `PATCH /units/:id` com o status desativado e a listagem passa a exibi-la como desativada

#### Scenario: Desativar unidade com pessoas é bloqueado com aviso

- **WHEN** o `global_admin` tenta desativar uma unidade que ainda tem pessoas e a API retorna 409
- **THEN** a SPA exibe um aviso de que a unidade não está vazia e mantém a unidade como ativa

#### Scenario: Reativar unidade

- **WHEN** um `global_admin` ativa uma unidade desativada
- **THEN** a SPA chama `PATCH /units/:id` com o status ativo e a listagem passa a exibi-la como ativa

#### Scenario: Não há exclusão permanente de unidade

- **WHEN** o `global_admin` vê as ações disponíveis para uma unidade
- **THEN** a SPA não oferece exclusão permanente, apenas renomear e ativar/desativar
