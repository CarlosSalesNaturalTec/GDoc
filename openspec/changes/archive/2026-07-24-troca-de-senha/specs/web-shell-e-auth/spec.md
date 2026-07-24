## MODIFIED Requirements

### Requirement: Shell de layout com identidade e navegação

A aplicação autenticada SHALL apresentar um **shell** de layout (usando o design
system Ant Design) com área de navegação, cabeçalho exibindo a identidade e o
papel do usuário corrente e a ação de logout, e uma área de conteúdo onde as
demais fatias montam suas telas. Os itens de navegação SHALL respeitar o papel
do usuário (itens de administração só aparecem para administradores).

A identidade no cabeçalho SHALL ser um **menu** que reúne o acesso a "Minha conta"
(rota `/minha-conta`, ver capability `web-minha-conta`) e a ação de logout. O acesso
a "Minha conta" SHALL ser oferecido a **qualquer** papel, inclusive `collaborator`,
por não ser item de administração.

Referência: PRD NFR de Usabilidade ("interface limpa e premium, navegação
familiar"); PRD US 1.3; design.md D5/D6.

#### Scenario: Shell mostra identidade e navegação conforme o papel
- **WHEN** uma pessoa autenticada visualiza o shell
- **THEN** vê seu nome/identidade e papel, a ação de logout e apenas os itens de
  navegação permitidos ao seu papel

#### Scenario: Menu de identidade dá acesso a Minha conta em qualquer papel
- **WHEN** uma pessoa com papel `collaborator` abre o menu de identidade no
  cabeçalho
- **THEN** encontra o acesso a "Minha conta" e a ação de logout
