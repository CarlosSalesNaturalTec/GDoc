# Spec — permissoes-granulares (delta)

Capability existente. Esta mudança implementa a **US 4.3** do PRD
(`docs/prd_final.md`) na parte que toca o modelo de concessão: prazo de expiração
**opcional**, semântica de reconcessão com prazo, e distinção entre concessão
vigente e expirada na listagem. O corte de acesso em si é normatizado pela
capability `controle-acesso`. Ver design.md D1–D3.

## MODIFIED Requirements

### Requirement: Concessão de permissão por pessoa sobre pasta ou arquivo

O sistema SHALL permitir que um administrador conceda a uma **pessoa** um ou mais
verbos de permissão (`view`, `download`, `upload`, `rename`, `delete`) sobre um
recurso, sendo o recurso uma **pasta** ou um **arquivo** identificado por seu id.
A concessão SHALL ser registrada como uma linha por `(pessoa, recurso, verbo)`,
de forma **idempotente**: reconceder um verbo já concedido não SHALL criar
duplicata nem falhar. A concessão SHALL registrar quem concedeu. Conceder apenas um
verbo (ex.: `view`) NÃO SHALL implicar os demais verbos nem acesso a outros itens.

A concessão SHALL admitir um **prazo de expiração opcional**. Ausência de prazo
SHALL significar concessão **permanente**, que vale até ser revogada manualmente —
preservando o comportamento de toda concessão anterior a esta mudança, sem
necessidade de conversão de dados. O prazo SHALL ser informado por concessão, e
verbos distintos concedidos numa mesma operação SHALL poder receber o mesmo prazo.

Reconceder um verbo já concedido SHALL fazer o **prazo informado passar a valer**,
seja ele mais distante ou mais próximo que o vigente — o último ato administrativo
prevalece. Reconceder **sem informar prazo** um verbo que possuía prazo SHALL
torná-lo permanente. Em nenhum desses casos a reconcessão SHALL duplicar a linha
ou falhar, e ela SHALL atualizar o registro de quem concedeu, de modo que a trilha
reflita quem alterou o prazo. Referência: PRD US 4.1, cenário 1; US 4.3;
design.md D3 do change `expiracao-permissoes`.

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

#### Scenario: Concessão sem prazo é permanente
- **WHEN** um administrador concede um verbo sem informar prazo de expiração
- **THEN** a concessão vale até ser revogada manualmente

#### Scenario: Concessão com prazo registra o vencimento
- **WHEN** um administrador concede um verbo informando um prazo de expiração
- **THEN** a concessão é registrada com esse vencimento e vale até que ele seja
  atingido

#### Scenario: Reconceder com novo prazo estende o acesso
- **WHEN** um administrador reconcede, com prazo mais distante, um verbo que a
  pessoa já possuía com prazo
- **THEN** o novo prazo passa a valer, sem duplicar a concessão

#### Scenario: Reconceder com prazo mais próximo encurta o acesso
- **WHEN** um administrador reconcede, com prazo mais próximo, um verbo que a
  pessoa já possuía
- **THEN** o novo prazo passa a valer, encurtando o acesso

#### Scenario: Reconceder sem prazo torna a concessão permanente
- **WHEN** um administrador reconcede, sem informar prazo, um verbo que a pessoa
  possuía com prazo de expiração
- **THEN** a concessão passa a ser permanente

### Requirement: Gestão de concessões restrita à administração

Os endpoints de conceder, listar e revogar permissões SHALL ser acessíveis apenas a
`unit_admin` e `global_admin`; um `collaborator` que os invoque SHALL receber 403.
`unit_admin` SHALL operar somente sobre recursos e pessoas da própria unidade (a RLS
por `unit_id` é a garantia final, mesmo que a checagem de papel falhasse), enquanto
`global_admin` SHALL ter alcance sobre todas as unidades. Conceder sobre um recurso
inexistente ou de outra unidade, ou a uma pessoa inexistente ou de outra unidade,
SHALL ser recusado sem vazar a existência do recurso/pessoa. Revogar um verbo SHALL
remover a linha correspondente, sem afetar os demais verbos nem os registros de
auditoria de acessos já ocorridos.

A listagem de concessões de um recurso SHALL informar, para cada concessão, o seu
**prazo de expiração** quando houver, e SHALL **distinguir concessões vigentes de
concessões expiradas**. Uma concessão expirada SHALL permanecer registrada e
visível na listagem, marcada como expirada — **expirar não é revogar**: o
vencimento torna a concessão inerte para efeito de acesso, mas preserva a trilha
de que aquela pessoa teve aquele acesso e até quando, de modo que registros de
auditoria anteriores permaneçam interpretáveis. Apenas a revogação SHALL remover a
concessão do registro. Referência: PRD US 4.1; US 4.3; Épico 5 (isolamento);
design.md D2 do change `expiracao-permissoes`.

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

#### Scenario: Listagem informa o vencimento e o estado da concessão
- **WHEN** um administrador lista as concessões de um recurso que tem concessões
  permanentes, com prazo futuro e já vencidas
- **THEN** vê o prazo de cada uma que o possui e distingue as vigentes das
  expiradas

#### Scenario: Concessão expirada permanece registrada
- **WHEN** o prazo de uma concessão é atingido
- **THEN** a concessão continua aparecendo na listagem, marcada como expirada, em
  vez de desaparecer do registro

#### Scenario: Revogar remove o registro, ao contrário de expirar
- **WHEN** um administrador revoga uma concessão expirada
- **THEN** a concessão deixa de constar da listagem
