# Spec — permissoes-granulares (delta)

Capability nova. Implementa o Épico 4 / **US 4.1** do PRD (`docs/prd_final.md`),
na fatia **por pessoa** (grupo é fatia futura — ver design.md D7). Os cenários
Given/When/Then da US são vinculantes; os requisitos abaixo os tornam verificáveis
no backend. A UI de gestão de permissões é consumo do contrato pelo frontend e está
fora desta fatia. Referência de verbos: visualizar, baixar, enviar,
renomear/substituir, excluir.

## ADDED Requirements

### Requirement: Concessão de permissão por pessoa sobre pasta ou arquivo

O sistema SHALL permitir que um administrador conceda a uma **pessoa** um ou mais
verbos de permissão (`view`, `download`, `upload`, `rename`, `delete`) sobre um
recurso, sendo o recurso uma **pasta** ou um **arquivo** identificado por seu id.
A concessão SHALL ser registrada como uma linha por `(pessoa, recurso, verbo)`,
de forma **idempotente**: reconceder um verbo já concedido não SHALL criar
duplicata nem falhar. A concessão SHALL registrar quem concedeu. Conceder apenas um
verbo (ex.: `view`) NÃO SHALL implicar os demais verbos nem acesso a outros itens.
Referência: PRD US 4.1, cenário 1.

#### Scenario: Concessão de um único verbo sobre arquivos selecionados
- **WHEN** um administrador concede apenas `view` a uma pessoa sobre um ou mais
  arquivos selecionados
- **THEN** a pessoa passa a poder visualizar exatamente aqueles arquivos, sem
  receber `download`/`rename`/`delete` nem acesso a outros itens da mesma pasta

#### Scenario: Reconceder é idempotente
- **WHEN** um administrador concede um verbo que a pessoa já possui sobre o mesmo
  recurso
- **THEN** a permissão permanece registrada uma única vez, sem erro e sem duplicação

#### Scenario: Concessão de múltiplos verbos numa só operação
- **WHEN** um administrador concede, numa única requisição, um conjunto de verbos a
  uma pessoa sobre um recurso
- **THEN** cada verbo do conjunto é registrado para aquela pessoa e recurso, e
  qualquer verbo já existente é preservado sem duplicação

### Requirement: Ausência de herança para o conteúdo interno de pastas

Conceder um verbo sobre uma **pasta** SHALL liberar apenas a própria pasta, e NÃO
SHALL propagar nenhum verbo para os arquivos ou subpastas contidos nela. Cada item
interno só SHALL ficar acessível se tiver recebido uma concessão explícita própria
(ou pertencer à pessoa). A resolução de permissão NÃO SHALL derivar acesso de um
recurso ancestral. Referência: PRD US 4.1, cenário 2.

#### Scenario: Grant em pasta não expõe os arquivos internos
- **WHEN** uma pessoa recebe `view` sobre uma pasta que contém arquivos de outra
  pessoa, sem grant sobre esses arquivos
- **THEN** ela pode abrir a pasta, mas os arquivos internos não aparecem para ela e
  ela não consegue visualizá-los nem baixá-los

#### Scenario: Liberação explícita de um item interno
- **WHEN** além do grant sobre a pasta, a pessoa recebe `view` sobre um arquivo
  específico dentro dela
- **THEN** apenas aquele arquivo passa a ser acessível, enquanto os demais itens da
  pasta continuam ocultos

### Requirement: Gestão de concessões restrita à administração

Os endpoints de conceder, listar e revogar permissões SHALL ser acessíveis apenas a
`unit_admin` e `global_admin`; um `collaborator` que os invoque SHALL receber 403.
`unit_admin` SHALL operar somente sobre recursos e pessoas da própria unidade (a RLS
por `unit_id` é a garantia final, mesmo que a checagem de papel falhasse), enquanto
`global_admin` SHALL ter alcance sobre todas as unidades. Conceder sobre um recurso
inexistente ou de outra unidade, ou a uma pessoa inexistente ou de outra unidade,
SHALL ser recusado sem vazar a existência do recurso/pessoa. Revogar um verbo SHALL
remover a linha correspondente, sem afetar os demais verbos nem os registros de
auditoria de acessos já ocorridos. Referência: PRD US 4.1; Épico 5 (isolamento).

#### Scenario: Colaborador não pode conceder
- **WHEN** um `collaborator` tenta conceder uma permissão
- **THEN** a operação é recusada com 403 e nenhuma concessão é criada

#### Scenario: Administrador de unidade não concede fora da própria unidade
- **WHEN** um `unit_admin` tenta conceder permissão sobre um recurso de outra
  unidade
- **THEN** a operação é recusada sem revelar a existência do recurso e nenhuma
  concessão é criada

#### Scenario: Revogação remove apenas o verbo indicado
- **WHEN** um administrador revoga um verbo que uma pessoa possuía sobre um recurso
- **THEN** aquele verbo deixa de valer para a pessoa, os outros verbos que ela
  possuía sobre o mesmo recurso permanecem, e a auditoria de acessos anteriores é
  preservada
