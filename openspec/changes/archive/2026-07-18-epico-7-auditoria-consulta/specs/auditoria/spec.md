## ADDED Requirements

### Requirement: Consulta do registro de acesso de um arquivo

O sistema SHALL expor a consulta (lado de leitura) do registro de auditoria de
**acesso** de um arquivo — os eventos `view` e `download` já gravados a cada
emissão de URL assinada. A consulta SHALL retornar, para cada evento, **quem**
realizou a ação (identidade do ator: id, nome e e-mail), **qual** ação
(`view` ou `download`) e **quando** (data e hora, `created_at`), ordenados do
mais recente para o mais antigo. Cobre **US 7.1** e **US 7.2** (`docs/prd_final.md`).

Os eventos retornados SHALL restringir-se às ações de acesso (`view`/
`download`); os demais tipos de evento registrados na tabela
(`upload`/`rename`/`replace`/`delete`/`restore`) NÃO SHALL ser expostos nesta
consulta.

#### Scenario: Registro de acesso consultável (US 7.1 cenário 1)
- **WHEN** uma pessoa autorizada consulta a auditoria de um arquivo que já teve
  eventos de visualização e/ou download
- **THEN** o sistema retorna cada acesso com quem realizou, qual ação
  (visualizar ou baixar) e a data e hora correspondentes, do mais recente para
  o mais antigo

#### Scenario: Arquivo sem acessos registrados
- **WHEN** uma pessoa autorizada consulta a auditoria de um arquivo que ainda
  não teve nenhum evento de acesso
- **THEN** o sistema retorna uma lista vazia (não um erro)

### Requirement: Autorização de consulta restrita a dono ou administrador da unidade

A consulta da auditoria de um arquivo SHALL ser autorizada **apenas** para o
dono do arquivo (`files.owner_id`) OU para o administrador da unidade do arquivo
(`unit_admin` ou `global_admin` cuja unidade é a do arquivo). Esta autorização
SHALL ser **mais estrita** que o acesso ao conteúdo: possuir grant `view` ou
`download` sobre o arquivo NÃO SHALL, por si só, conceder acesso à auditoria —
ver quem acessou o arquivo é direito de dono/administrador (RF #9, RF #11), não
consequência de poder abrir o arquivo.

O papel de administrador NÃO SHALL, por si só e fora da sua unidade, conceder
consulta de auditoria: o bypass de RLS do `global_admin` NÃO SHALL permitir
consultar a auditoria de arquivo de outra unidade.

#### Scenario: Dono consulta o próprio arquivo (US 7.2 cenário 1)
- **WHEN** o dono de um arquivo consulta a auditoria desse arquivo
- **THEN** o sistema retorna os acessos ao arquivo que ele enviou

#### Scenario: Dono não vê arquivos de outras pessoas (US 7.2 cenário 1)
- **WHEN** uma pessoa consulta a auditoria de um arquivo do qual não é dono nem
  administrador da unidade
- **THEN** o sistema nega a consulta e não retorna nenhum registro de auditoria

#### Scenario: Administrador da unidade consulta qualquer arquivo da unidade
- **WHEN** um administrador consulta a auditoria de um arquivo da sua unidade do
  qual não é dono
- **THEN** o sistema retorna os acessos ao arquivo

#### Scenario: Grant de acesso não concede auditoria
- **WHEN** um colaborador que possui grant `view` (ou `download`) sobre um
  arquivo — mas não é dono nem administrador da unidade — consulta a auditoria
  desse arquivo
- **THEN** o sistema nega a consulta

### Requirement: Isolamento por unidade e comportamento fail-closed da consulta

A consulta de auditoria SHALL respeitar o isolamento por unidade pela RLS de
`audit_events` (`unit_id`), sem depender apenas de checagem na aplicação: um
evento de arquivo de outra unidade NÃO SHALL aparecer na consulta. A resolução
SHALL ser fail-closed e não vazar existência — consultar a auditoria de um
arquivo inexistente, de outra unidade (escondido pela RLS) ou do qual o
solicitante não é dono nem administrador SHALL ser negado sem distinguir os
casos e sem emitir corpo de auditoria.

Um arquivo que esteja na lixeira (excluído, ainda não expurgado) SHALL resolver
como inexistente para a consulta de auditoria (`deleted_at IS NULL`).

#### Scenario: Isolamento entre unidades
- **WHEN** uma pessoa de uma unidade tenta consultar a auditoria de um arquivo
  de outra unidade
- **THEN** o sistema nega a consulta sem revelar se o arquivo existe

#### Scenario: Arquivo inexistente
- **WHEN** alguém consulta a auditoria de um identificador de arquivo que não
  existe
- **THEN** o sistema nega a consulta com o mesmo resultado de um arquivo sem
  permissão, sem distinguir os casos

#### Scenario: Arquivo na lixeira
- **WHEN** o dono ou administrador consulta a auditoria de um arquivo que está
  na lixeira (excluído, ainda não expurgado)
- **THEN** o sistema resolve o arquivo como inexistente e nega a consulta
