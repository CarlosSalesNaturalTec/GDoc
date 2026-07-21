# web-permissoes Specification

## Purpose

Define os requisitos verificáveis do diálogo de gestão de permissões
granulares da SPA do GDoc — a ação **"Permissões"** disponível por item do
explorador (pasta ou arquivo), restrita a `unit_admin`/`global_admin`, que
permite conceder um ou mais verbos a uma pessoa sobre o recurso
(`POST /grants`), visualizar as concessões vigentes do recurso
(`GET /grants?resourceType=&resourceId=`) com revogação por verbo
(`DELETE /grants/:id`), e o aviso explícito de que a concessão sobre uma pasta
não propaga aos itens internos. Implementa o lado de frontend da US 4.1 e dos
RF #7/#8 do PRD (`docs/prd_final.md`), consumindo as rotas admin-only já
entregues pelo backend do Épico 4 (spec `permissoes-granulares`), sem
re-descrever seus cenários.

## Requirements

### Requirement: Ação de gestão de permissões restrita a administrador no explorador

A SPA SHALL oferecer, em cada item do explorador (pasta ou arquivo), uma ação
**"Permissões"** que abre o diálogo de gestão de concessões daquele recurso. A
ação SHALL ser renderizada **somente** para pessoas com papel `unit_admin` ou
`global_admin` (lido da sessão via `useSession`), espelhando o fato de as rotas
de `grants` serem admin-only no backend; para um `collaborator` a ação NÃO SHALL
aparecer. Ao abrir, o diálogo SHALL operar sobre o recurso da linha, com
`resourceType` = `folder` para pasta e `file` para arquivo, e `resourceId` = id
do item. A SPA nunca é a linha de defesa — a garantia final é a checagem de
papel e a RLS no servidor. Referência: PRD US 4.1; RF #7/#8.

#### Scenario: Administrador vê a ação Permissões
- **WHEN** um `unit_admin` ou `global_admin` visualiza a listagem do explorador
- **THEN** cada linha (pasta ou arquivo) exibe a ação "Permissões", que abre o
  diálogo de gestão de concessões para aquele recurso

#### Scenario: Colaborador não vê a ação Permissões
- **WHEN** um `collaborator` visualiza a listagem do explorador
- **THEN** a ação "Permissões" não é renderizada em nenhuma linha e ele não tem
  caminho pela SPA para conceder ou revogar permissões

### Requirement: Concessão de verbos a uma pessoa sobre um recurso

Dentro do diálogo, o administrador SHALL poder selecionar **uma pessoa** (de uma
lista carregada por `GET /users`, admin-only, com o nome exibido) e **um ou mais
verbos** dentre `view`, `download`, `upload`, `rename`, `delete` (enum
`Permission` de `@gdoc/shared`, com rótulos em pt-BR), e conceder todos os verbos
marcados em **uma única** chamada `POST /grants` com `{subjectUserId,
resourceType, resourceId, permissions}`. Conceder apenas um verbo NÃO SHALL
implicar os demais. A operação SHALL ser idempotente: reconceder um verbo que a
pessoa já possui sobre o mesmo recurso NÃO SHALL falhar nem duplicar (o servidor
garante via `ON CONFLICT DO NOTHING`). Ao concluir com sucesso, a SPA SHALL
recarregar a lista de concessões vigentes do recurso (invalidação da query), sem
polling. Referência: PRD US 4.1, cenários 1 e 3.

#### Scenario: Concessão de um único verbo
- **WHEN** o administrador seleciona uma pessoa, marca apenas `view` e confirma a
  concessão sobre um recurso
- **THEN** a SPA envia `POST /grants` com `permissions: ['view']` para aquele
  recurso e pessoa, e a lista de vigentes passa a exibir a concessão de `view`
  sem `download`/`rename`/`delete`

#### Scenario: Concessão de múltiplos verbos numa só operação
- **WHEN** o administrador marca mais de um verbo (ex.: `view` e `download`) e
  confirma
- **THEN** a SPA envia uma única `POST /grants` com todos os verbos marcados no
  array `permissions`, e todos passam a constar nos vigentes

#### Scenario: Reconceder é idempotente
- **WHEN** o administrador concede um verbo que a pessoa já possui sobre o mesmo
  recurso
- **THEN** a operação conclui sem erro, a concessão continua listada uma única
  vez e nenhuma duplicata aparece na lista de vigentes

### Requirement: Visão e revogação das concessões vigentes do recurso

O diálogo SHALL exibir as concessões vigentes do recurso aberto, obtidas por
`GET /grants?resourceType=<tipo>&resourceId=<id>`, listando cada concessão como
**pessoa · verbo** (o nome da pessoa resolvido a partir de `GET /users`; o verbo
com rótulo pt-BR). Cada concessão listada SHALL ter uma ação **"Revogar"** que
chama `DELETE /grants/:id` para aquela linha. Revogar um verbo SHALL remover
**apenas** aquele verbo, preservando os demais verbos que a pessoa possua sobre o
mesmo recurso; ao concluir, a SPA SHALL recarregar a lista de vigentes. Quando o
recurso não tem concessão alguma, o diálogo SHALL indicar a ausência (estado
vazio) em vez de uma lista em branco. Referência: PRD US 4.1.

#### Scenario: Revogação remove apenas o verbo indicado
- **WHEN** uma pessoa possui `view` e `download` sobre um recurso e o
  administrador clica em "Revogar" na linha de `download`
- **THEN** a SPA chama `DELETE /grants/:id` daquela concessão e, ao recarregar,
  a linha de `download` some enquanto a de `view` permanece

#### Scenario: Recurso sem concessões
- **WHEN** o administrador abre o diálogo de um recurso que não tem nenhuma
  concessão registrada
- **THEN** a lista de vigentes exibe um estado vazio, sem linhas de concessão

### Requirement: Aviso explícito de ausência de herança em pasta

O diálogo SHALL exibir, ao gerir permissões de uma **pasta**, um aviso explícito
de que conceder um verbo sobre a pasta libera **apenas a própria pasta** e NÃO
propaga acesso aos arquivos ou subpastas contidos nela — cada item interno exige
concessão própria. É o reflexo de UI da regra de não-herança do motor de acesso
do servidor (`access.ts`), para o administrador não superestimar o alcance da
concessão. Referência: PRD US 4.1, cenário 2.

#### Scenario: Aviso de não-herança visível ao gerir uma pasta
- **WHEN** o administrador abre o diálogo de permissões de uma pasta
- **THEN** o diálogo apresenta um aviso de que a concessão vale só para a pasta e
  não libera automaticamente o conteúdo interno
