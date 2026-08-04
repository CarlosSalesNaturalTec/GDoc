# Spec — notificacoes (delta)

Capability nova. Existe para satisfazer os dois cenários de aviso da **US 4.3** do
PRD (`docs/prd_final.md`) — "a pessoa é avisada previamente" e "a área
administrativa é avisada do corte" —, que não tinham nenhum canal onde acontecer.
O canal nasce genérico e atrás de um seam de aplicação, mas nesta fatia só a
expiração de permissão o utiliza. O **corte** de acesso não depende deste canal
nem da rotina que o alimenta — ver capability `controle-acesso` e design.md D1.

## ADDED Requirements

### Requirement: Canal de notificação por pessoa, isolado por unidade

O sistema SHALL oferecer um canal de notificação capaz de entregar avisos a uma
**pessoa** identificada, com um tipo de evento e os dados necessários para
interpretá-lo. As notificações SHALL ser dado de unidade e portanto SHALL estar
sujeitas ao isolamento por `unit_id` com policy de segurança em nível de linha, no
mesmo formato das demais tabelas tenant-scoped. Uma pessoa SHALL acessar
exclusivamente as próprias notificações, e NÃO SHALL, por nenhum papel, acessar
notificações de outra pessoa ou de outra unidade — inclusive o `global_admin`, cujo
bypass NÃO SHALL alcançar notificações de unidade diversa da do seu contexto.
Referência: CLAUDE.md (isolamento por unidade; trava do bypass de `global_admin`);
design.md D5.

#### Scenario: Pessoa acessa apenas as próprias notificações
- **WHEN** uma pessoa consulta suas notificações
- **THEN** recebe somente as notificações destinadas a ela

#### Scenario: Notificação não atravessa unidade
- **WHEN** uma pessoa de uma unidade consulta suas notificações e existem
  notificações em outra unidade
- **THEN** nenhuma notificação de outra unidade é retornada

#### Scenario: Administrador global não alcança notificações de outra unidade
- **WHEN** um `global_admin` consulta notificações estando no contexto de uma
  unidade
- **THEN** não obtém notificações pertencentes a outra unidade

### Requirement: Entrega de notificação atrás de um seam de aplicação

O sistema SHALL emitir notificações através de uma **interface de aplicação**, e a
regra de negócio que decide *quem avisar e quando* NÃO SHALL depender do meio de
entrega. A implementação ativa SHALL ser escolhida em um único ponto de composição
das dependências, de modo que acrescentar outro meio de entrega no futuro NÃO
SHALL exigir alteração na regra de expiração nem na rotina que a executa. Nesta
fatia o meio entregue SHALL ser a notificação **na própria aplicação**.
Referência: CLAUDE.md (Ports & Adapters); design.md D4.

#### Scenario: Regra de aviso não conhece o meio de entrega
- **WHEN** a rotina determina que uma pessoa deve ser avisada
- **THEN** ela emite a notificação pela interface, sem depender de qual
  implementação de entrega está ativa

#### Scenario: Trocar o meio de entrega não altera a regra
- **WHEN** uma implementação de entrega diferente é escolhida na composição das
  dependências
- **THEN** a regra que decide quem avisar e quando permanece inalterada

### Requirement: Emissão de notificação é idempotente por evento de origem

O sistema SHALL identificar cada notificação pelo **evento de origem** que a
motivou, e NÃO SHALL criar notificação duplicada para o mesmo destinatário, tipo e
evento de origem. A identificação do evento de origem NÃO SHALL depender do
instante da execução, de modo que reexecutar a rotina — por nova tentativa
automática, por implantação no meio da janela ou por execução manual — NÃO SHALL
produzir avisos repetidos. Referência: design.md D5.

#### Scenario: Reexecução no mesmo dia não duplica aviso
- **WHEN** a rotina de avisos é executada mais de uma vez enquanto a mesma
  condição persiste
- **THEN** o destinatário continua com uma única notificação para aquele evento

#### Scenario: Eventos distintos geram notificações distintas
- **WHEN** a mesma pessoa é avisada da aproximação do vencimento e, depois, ocorre
  um evento diferente que também a notifica
- **THEN** cada evento produz sua própria notificação

### Requirement: Leitura e marcação de notificações

A aplicação SHALL permitir que a pessoa consulte suas notificações, distinga as
**não lidas** das já lidas e marque notificações como lidas. A quantidade de não
lidas SHALL estar disponível para exibição no shell da aplicação. Marcar como lida
NÃO SHALL apagar a notificação. Referência: design.md D4.

#### Scenario: Pessoa vê a contagem de não lidas
- **WHEN** uma pessoa com notificações não lidas acessa a aplicação
- **THEN** a quantidade de não lidas fica visível no shell

#### Scenario: Marcar como lida preserva a notificação
- **WHEN** uma pessoa marca uma notificação como lida
- **THEN** a notificação deixa de contar como não lida, mas continua consultável

### Requirement: Aviso prévio de expiração é enviado à pessoa que recebeu a concessão

O sistema SHALL avisar a **pessoa destinatária** de uma concessão quando o prazo de
expiração dela se aproximar, dentro de uma janela de antecedência **configurável
por ambiente** e NÃO fixa no código. O aviso SHALL identificar o recurso, o verbo
concedido e a data de vencimento. Concessões **sem** prazo NÃO SHALL gerar aviso.
Referência: PRD US 4.3, cenário 1; design.md D6.

#### Scenario: Pessoa é avisada dentro da janela de antecedência
- **WHEN** o vencimento de uma concessão entra na janela de antecedência
  configurada
- **THEN** a pessoa destinatária recebe um aviso identificando o recurso, o verbo e
  a data de vencimento

#### Scenario: Concessão permanente não gera aviso
- **WHEN** a rotina avalia concessões sem prazo de expiração
- **THEN** nenhum aviso de vencimento é emitido para elas

#### Scenario: Janela de antecedência é configurável
- **WHEN** a janela de antecedência é alterada na configuração do ambiente
- **THEN** a rotina passa a avisar conforme a nova janela, sem alteração de código

### Requirement: Aviso de corte é enviado à administração da unidade da concessão

O sistema SHALL avisar os **administradores da unidade à qual a concessão pertence**
quando o prazo for atingido e o acesso correspondente estiver encerrado. O aviso
SHALL identificar a pessoa afetada, o recurso e o verbo cortado. O aviso de corte
NÃO SHALL ser enviado a administradores de outra unidade, e NÃO SHALL alcançar o
`global_admin` fora da unidade da concessão — a lista de acessos cortados de uma
unidade é informação da unidade, sujeita à mesma trava que impede o administrador
global de ser observador universal sobre conteúdo e auditoria alheios. A pessoa
afetada NÃO SHALL ser avisada novamente no momento do corte, por já ter recebido o
aviso prévio. Referência: PRD US 4.3, cenário 2; CLAUDE.md (trava do bypass de
`global_admin`); design.md D6.

#### Scenario: Administração da unidade é avisada do corte
- **WHEN** o prazo de uma concessão é atingido
- **THEN** os administradores da unidade da concessão recebem aviso identificando
  a pessoa afetada, o recurso e o verbo cortado

#### Scenario: Administração de outra unidade não é avisada
- **WHEN** uma concessão de uma unidade expira
- **THEN** administradores de outras unidades não recebem aviso a respeito

#### Scenario: Pessoa afetada não é avisada duas vezes
- **WHEN** o prazo de uma concessão é atingido após o aviso prévio já ter sido
  enviado à pessoa
- **THEN** a pessoa não recebe um segundo aviso pelo corte

### Requirement: Falha da rotina de avisos não afeta o encerramento do acesso

A rotina que emite os avisos SHALL ser executada periodicamente por um agendamento
próprio, **separado** da rotina de expurgo da lixeira e em horário que não colida
com ela. Uma falha, atraso ou não execução dessa rotina NÃO SHALL, em nenhuma
hipótese, prolongar um acesso vencido — o encerramento é resolvido na verificação
de acesso e independe de qualquer rotina. A rotina SHALL registrar um sumário do
que processou e SHALL tolerar falha parcial sem interromper o processamento dos
demais itens. Referência: PRD US 4.3, cenário 2; design.md D1, D7.

#### Scenario: Rotina não executada não prolonga acesso
- **WHEN** a rotina de avisos falha ou não é executada após um vencimento
- **THEN** o acesso correspondente permanece encerrado, e apenas o aviso deixa de
  ser emitido

#### Scenario: Falha parcial não interrompe o restante
- **WHEN** a emissão de um aviso falha durante a execução
- **THEN** os demais avisos continuam sendo processados e o sumário registra a
  falha
