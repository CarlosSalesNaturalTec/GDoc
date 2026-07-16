# navegacao Specification

## Purpose

Define os requisitos verificáveis de navegação por pastas aninhadas do GDoc —
criação de pastas por unidade, colocação de arquivos em pastas e navegação com
trilha (breadcrumb) — na fatia **só-por-dono** do Épico 2 / US 2.1 do PRD
(`docs/prd_final.md`). A metade "itens que criei" do cenário 2 é vinculante
aqui; a metade "itens que me foram liberados" e o alcance administrativo sobre
itens de terceiros ficam para o Épico 4 (permissões) e Épico 5 (US 5.1). Os
cenários Given/When/Then da US 2.1 são vinculantes e este spec os torna
verificáveis no backend.

## Requirements

### Requirement: Pastas aninhadas por unidade

O sistema SHALL permitir que uma pessoa autenticada crie pastas em `POST /folders`,
na raiz da sua unidade ou dentro de outra pasta da qual seja dona, formando uma
hierarquia aninhada. Toda pasta SHALL ser vinculada à unidade (`unit_id`) e ao dono
(`owner_id`), e o isolamento entre unidades SHALL ser imposto no banco por RLS, não
apenas na aplicação. Referência: PRD US 2.1.

#### Scenario: Criação de pasta na raiz
- **WHEN** uma pessoa cria uma pasta sem informar pasta-pai
- **THEN** a pasta é criada na raiz da sua unidade, vinculada a ela e ao criador como
  dono

#### Scenario: Criação de subpasta dentro de pasta própria
- **WHEN** uma pessoa cria uma pasta informando como pai uma pasta da qual é dona
- **THEN** a nova pasta é criada como filha dela, preservando o aninhamento

#### Scenario: Pasta-pai de outra unidade não é utilizável
- **WHEN** uma pessoa tenta criar uma subpasta apontando para uma pasta-pai de outra
  unidade
- **THEN** a operação é recusada e nenhuma pasta é criada, sem revelar a existência
  da pasta de outra unidade

### Requirement: Colocação de arquivos em pastas

O sistema SHALL permitir que um arquivo seja associado a uma pasta no momento do
envio, informando a pasta de destino; um arquivo sem pasta informada SHALL residir na
raiz da unidade. A pasta de destino SHALL pertencer à mesma unidade do remetente.
Referência: PRD US 2.1.

#### Scenario: Envio para uma pasta
- **WHEN** uma pessoa solicita o envio de um arquivo informando uma pasta de destino
  da sua unidade
- **THEN** o arquivo passa a residir logicamente nessa pasta

#### Scenario: Envio sem pasta cai na raiz
- **WHEN** uma pessoa solicita o envio de um arquivo sem informar pasta
- **THEN** o arquivo passa a residir na raiz da unidade

### Requirement: Navegação com trilha e visibilidade só-por-dono

O sistema SHALL listar o conteúdo de uma pasta (subpastas e arquivos) em uma rota de
navegação, exibindo **apenas os itens dos quais o solicitante é dono**, e SHALL
devolver a trilha (breadcrumb) da raiz até a pasta corrente, permitindo retornar a
qualquer nível anterior. A listagem SHALL respeitar o isolamento por unidade via RLS.
Itens de outras pessoas, ainda que na mesma pasta, NÃO SHALL aparecer nesta fatia — a
visibilidade por concessão explícita é o Épico 4. Referência: PRD US 2.1.

#### Scenario: Navegar e atualizar a trilha
- **WHEN** uma pessoa entra em uma subpasta à qual tem acesso como dona
- **THEN** vê o conteúdo permitido dessa subpasta e a trilha é atualizada com o
  caminho da raiz até ela, cada nível permitindo retorno com um clique

#### Scenario: Item de outra pessoa não aparece na listagem
- **WHEN** uma pasta contém itens criados por outra pessoa e itens criados pelo
  solicitante
- **THEN** apenas os itens dos quais o solicitante é dono são exibidos

#### Scenario: Conteúdo de outra unidade nunca aparece
- **WHEN** uma pessoa navega pelas pastas
- **THEN** nunca vê pastas ou arquivos pertencentes a outra unidade, mesmo por
  identificador direto de pasta
