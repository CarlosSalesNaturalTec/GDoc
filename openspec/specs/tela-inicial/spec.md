# tela-inicial Specification

## Purpose

Definir o que a tela de entrada apresenta a quem acabou de entrar — quem é,
onde está, o que pode fazer e o que mudou recentemente — e as garantias de
permissão e isolamento por unidade que essa apresentação não pode violar.

## Requirements

### Requirement: Tela inicial identifica a pessoa pelo nome

A tela inicial SHALL apresentar o nome da pessoa autenticada, a sua função e a
sua unidade. NÃO SHALL apresentar identificador interno, fragmento de
identificador ou qualquer valor que a pessoa não reconheça como seu.
Referência: PRD US 11.1.

#### Scenario: Pessoa vê o próprio nome ao entrar
- **WHEN** uma pessoa autenticada abre a tela inicial
- **THEN** vê seu nome, sua função e sua unidade

#### Scenario: Pessoa sem nome cadastrado não vê identificador interno
- **WHEN** uma pessoa cuja conta não tem nome cadastrado abre a tela inicial
- **THEN** a saudação recorre a um tratamento genérico, e em nenhum momento
  apresenta o identificador interno da conta

### Requirement: Atalhos da tela inicial refletem o que o perfil pode fazer

A tela inicial SHALL apresentar atalhos para as ações de uso frequente,
restritos aos que o perfil da pessoa pode executar. NÃO SHALL apresentar atalho
que resultaria em recusa ao ser acionado. Cada atalho SHALL conduzir à ação que
anuncia, e NÃO SHALL deixar a ação por localizar na tela de destino; dois atalhos
distintos NÃO SHALL conduzir ao mesmo ponto de partida. Referência: PRD US 11.1.

#### Scenario: Atalho fora do alcance do perfil não é apresentado
- **WHEN** uma pessoa cujo perfil não permite determinada ação abre a tela
  inicial
- **THEN** o atalho correspondente não é apresentado

#### Scenario: Atalho apresentado conduz a uma ação executável
- **WHEN** uma pessoa aciona qualquer atalho apresentado na sua tela inicial
- **THEN** alcança a ação correspondente, sem recusa por permissão

#### Scenario: O atalho de envio conduz ao envio, não só à tela que o contém
- **WHEN** uma pessoa que pode enviar documentos aciona o atalho de envio
- **THEN** alcança a área de envio em condição de usá-la de imediato, sem precisar
  localizá-la na tela de destino

#### Scenario: O atalho de envio não conduz a uma recusa
- **WHEN** uma pessoa aciona o atalho de envio e a pasta de destino não lhe
  permite enviar
- **THEN** alcança a tela de destino normalmente, sem ser conduzida a uma área de
  envio que recusaria a ação

#### Scenario: Atalhos distintos têm destinos distintos
- **WHEN** uma pessoa compara os atalhos apresentados na sua tela inicial
- **THEN** cada um conduz a um ponto de partida próprio, sem dois atalhos
  diferentes levando ao mesmo lugar

### Requirement: Tela inicial oferece acesso rápido às pastas permitidas

A tela inicial SHALL apresentar acesso rápido às pastas de primeiro nível da
unidade da pessoa a que ela tem acesso. A seleção SHALL respeitar a resolução de
acesso já existente, e NÃO SHALL revelar a existência de pasta que a pessoa não
possa abrir. Referência: PRD US 11.1.

#### Scenario: Apenas pastas acessíveis aparecem
- **WHEN** uma pessoa com acesso a parte das pastas de primeiro nível da sua
  unidade abre a tela inicial
- **THEN** vê acesso rápido apenas às pastas que pode abrir, sem menção às
  demais

#### Scenario: Sem pastas acessíveis a área orienta em vez de ficar vazia
- **WHEN** uma pessoa sem acesso a nenhuma pasta de primeiro nível abre a tela
  inicial
- **THEN** a área informa a ausência de pastas disponíveis, em vez de permanecer
  vazia sem explicação

### Requirement: Tela inicial lista os documentos alterados recentemente

A tela inicial SHALL apresentar os documentos alterados recentemente, ordenados
da alteração mais recente para a mais antiga, com a data da alteração. SHALL
considerar alteração a publicação, a substituição, a renomeação e a
movimentação do documento. Referência: PRD US 11.2.

#### Scenario: Alterações aparecem da mais recente para a mais antiga
- **WHEN** documentos a que a pessoa tem acesso foram publicados, substituídos,
  renomeados ou movidos em instantes distintos
- **THEN** a lista os apresenta ordenados da alteração mais recente para a mais
  antiga, com a data de cada alteração

#### Scenario: Ausência de alterações é informada
- **WHEN** nenhum documento ao alcance da pessoa foi alterado
- **THEN** a área informa a ausência de alterações recentes, em vez de
  permanecer vazia sem explicação

### Requirement: A lista de recentes não amplia alcance

A lista de documentos recentes SHALL apresentar exclusivamente documentos que a
pessoa já poderia alcançar por navegação. NÃO SHALL revelar nome, pasta nem
existência de documento sobre o qual a pessoa não tenha permissão, e NÃO SHALL
apresentar documento de outra unidade, qualquer que seja o papel do
solicitante. Referência: PRD US 11.2.

#### Scenario: Documento sem permissão não aparece
- **WHEN** um documento sobre o qual a pessoa não tem permissão é alterado
- **THEN** ele não aparece na lista, nem seu nome, nem a pasta que o contém

#### Scenario: A lista não atravessa unidades
- **WHEN** documentos de outra unidade são alterados
- **THEN** nenhum deles aparece na lista, inclusive para o administrador global

#### Scenario: Perda de acesso remove o documento da lista
- **WHEN** a concessão que dava acesso a um documento listado expira ou é
  revogada
- **THEN** o documento deixa de aparecer na lista na consulta seguinte

### Requirement: Cartão da tela inicial é acionável em toda a sua área

Todo cartão que a tela inicial apresenta como caminho para um destino SHALL ser
acionável em qualquer ponto da sua área, e NÃO SHALL restringir o acionamento ao
texto do seu rótulo. A área sensível SHALL ser a do cartão apresentado, de modo
que o aspecto de superfície acionável corresponda ao que de fato aciona.
Referência: PRD US 11.1.

#### Scenario: Acionamento fora do texto do rótulo conduz ao destino
- **WHEN** uma pessoa aciona um cartão da tela inicial num ponto da sua área que
  não é o texto do rótulo — a descrição, o espaço livre à volta dela ou a margem
  interna do cartão
- **THEN** alcança o mesmo destino que alcançaria acionando o rótulo

#### Scenario: Aspecto acionável corresponde à área que aciona
- **WHEN** uma pessoa percorre com o ponteiro a área de um cartão da tela inicial
- **THEN** não encontra região que se apresente como acionável sem conduzir ao
  destino do cartão

#### Scenario: Cartão é alcançável e acionável pelo teclado
- **WHEN** uma pessoa percorre a tela inicial usando apenas o teclado
- **THEN** cada cartão recebe o foco, com indicação visível, e é acionável a
  partir dele, conduzindo ao seu destino

#### Scenario: Cartão respeita a área mínima de acionamento
- **WHEN** uma pessoa aciona um cartão da tela inicial em dispositivo de toque
- **THEN** a área sensível tem ao menos a altura mínima de acionamento exigida
  pelo piso de acessibilidade da aplicação

#### Scenario: Destino do cartão é identificável antes do acionamento
- **WHEN** uma pessoa aponta para um cartão da tela inicial, ou usa o recurso do
  navegador para abrir um destino em nova aba
- **THEN** o cartão expõe o endereço do seu destino, como qualquer link da
  aplicação

#### Scenario: Cartão é anunciado pelo seu rótulo
- **WHEN** uma pessoa que usa leitor de tela alcança um cartão da tela inicial
- **THEN** ele é anunciado pelo seu rótulo, sem que a descrição auxiliar seja
  incorporada ao nome do destino
