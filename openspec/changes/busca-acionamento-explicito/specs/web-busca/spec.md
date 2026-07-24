## ADDED Requirements

### Requirement: Busca acionada explicitamente pelo usuário

A SPA SHALL consultar `GET /files/search` **somente** quando o usuário acionar
explicitamente a busca — pelo botão **"Buscar"** da barra de filtros ou por
**Enter** no campo de nome — e NÃO SHALL consultar ao carregar a página nem ao
alterar qualquer controle de filtro. Ao abrir `/busca`, **nenhuma** requisição a
`GET /files/search` SHALL ser feita.

O botão "Buscar" SHALL ficar **desabilitado** enquanto **nenhum critério estiver
ativo**, e o Enter no campo de nome NÃO SHALL acionar a busca nessa condição — de
modo que a página de busca NÃO SHALL oferecer caminho para listar todo o acervo
sem critério algum. Um critério é considerado **ativo** quando o **nome** contém
algo além de espaços, ou quando **tipo**, **intervalo de data** ou **autor**
estiverem preenchidos. Um nome de **um único caractere** SHALL contar como
critério ativo — NÃO SHALL existir mínimo de caracteres.

Após uma busca, alterar os controles de filtro sem acionar a busca novamente
SHALL manter exibidos os resultados da última busca realizada, que só SHALL ser
substituídos por um novo acionamento.

Referência: PRD US 9.1 (cenário 1), RF #15; design.md D1/D2/D4/D6.

#### Scenario: Abrir a página não consulta o servidor
- **WHEN** o usuário abre a rota `/busca`
- **THEN** a SPA não chama `GET /files/search` e nenhum resultado é exibido

#### Scenario: Botão desabilitado sem nenhum critério
- **WHEN** nenhum dos filtros (nome, tipo, data, autor) está preenchido
- **THEN** o botão "Buscar" está desabilitado e pressionar Enter no campo de nome
  não dispara consulta alguma

#### Scenario: Acionar a busca consulta com os critérios ativos
- **WHEN** o usuário preenche ao menos um critério e aciona o botão "Buscar"
- **THEN** a SPA chama `GET /files/search` incluindo apenas os critérios ativos e
  exibe os itens retornados pelo servidor

#### Scenario: Enter no campo de nome aciona a mesma busca
- **WHEN** o usuário digita um nome e pressiona Enter no campo de nome
- **THEN** a SPA realiza a mesma consulta que o botão "Buscar" realizaria

#### Scenario: Um caractere no nome já habilita a busca
- **WHEN** o usuário digita um único caractere no campo de nome
- **THEN** o botão "Buscar" fica habilitado e o acionamento consulta o servidor
  com esse nome

#### Scenario: Alterar filtros após buscar mantém a lista anterior
- **WHEN** o usuário realizou uma busca e em seguida altera um filtro sem acionar
  a busca novamente
- **THEN** a lista continua exibindo os resultados da última busca realizada, e
  nenhuma nova consulta é feita até o próximo acionamento

### Requirement: Estado inicial distinto do estado sem resultados

A SPA SHALL exibir, enquanto nenhuma busca tiver sido realizada, um **estado
inicial** que instrui o usuário a informar ao menos um critério para buscar, e
SHALL mantê-lo **visualmente distinto** da indicação de **"nenhum resultado"**
usada quando uma busca foi realizada e não retornou item algum. A SPA NÃO SHALL
reusar a mensagem de "nenhum resultado" para o estado inicial — o usuário NÃO
SHALL ser levado a concluir que não existem arquivos visíveis a ele apenas por
ainda não ter buscado.

Os estados de **carregando** e de **erro** já existentes SHALL permanecer
inalterados.

Referência: PRD US 9.1, RF #15; design.md D5.

#### Scenario: Estado inicial instrui a informar um critério
- **WHEN** o usuário abre `/busca` e ainda não realizou nenhuma busca
- **THEN** a SPA exibe uma indicação de que é preciso informar ao menos um
  critério para buscar, e não a mensagem de "nenhum resultado"

#### Scenario: Busca sem retorno exibe "nenhum resultado"
- **WHEN** o usuário aciona uma busca com critérios que não correspondem a item
  algum
- **THEN** a SPA exibe a indicação de "nenhum resultado", distinta do estado
  inicial, sem erro

## MODIFIED Requirements

### Requirement: Botão de limpar filtros retorna ao estado inicial permitido

A barra de filtros SHALL oferecer um botão de **limpar filtros** que remove
**todos** os critérios ativos (nome, tipo, data e autor, quando presente) **e**
descarta os resultados exibidos, retornando a página ao **estado inicial** — o
mesmo estado de quem acabou de abrir `/busca`, com a instrução de informar um
critério. Ao limpar, a SPA **NÃO** SHALL refazer a busca: nenhuma requisição a
`GET /files/search` SHALL ser disparada, e o botão "Buscar" SHALL voltar a ficar
desabilitado até que um novo critério seja informado.

Esta é a leitura de **"estado inicial permitido"** adotada pelo produto para a
US 9.1 cenário 2: a tela volta a **não exibir dado algum** até uma nova busca,
em vez de listar todo o acervo visível ao usuário (design.md D3).

Referência: PRD US 9.1 (cenário 2), RF #15; design.md D1/D3/D5.

#### Scenario: Limpar filtros remove todos os critérios e volta ao estado inicial
- **WHEN** o usuário aplicou um ou mais filtros, realizou a busca e aciona o
  botão de limpar filtros
- **THEN** todos os filtros são removidos dos controles, os resultados deixam de
  ser exibidos e a página volta ao estado inicial

#### Scenario: Limpar filtros não consulta o servidor
- **WHEN** o usuário aciona o botão de limpar filtros
- **THEN** a SPA não chama `GET /files/search`, e o botão "Buscar" fica
  desabilitado até que um novo critério seja informado
