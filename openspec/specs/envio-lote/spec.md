# envio-lote Specification

## Purpose

Define os requisitos verificáveis de envio de múltiplos arquivos em uma única
operação (envio em lote) do GDoc — emissão de URLs assinadas por item e reserva
de cota consciente do conjunto — na fatia do Épico 3 / US 3.1 do PRD
(`docs/prd_final.md`). O backend garante que o resultado de cada item é
independente dos demais e que a nova tentativa pode ser só do item que falhou; a
camada visual (barra de progresso por arquivo) é consumo do contrato pelo
frontend e está fora desta fatia. Os cenários Given/When/Then da US 3.1 são
vinculantes e este spec os torna verificáveis no backend.

## Requirements

### Requirement: Emissão de URLs de envio em lote

O sistema SHALL aceitar, em `POST /files/upload-urls`, uma lista de itens a enviar e
SHALL responder com um resultado **por item**, na mesma ordem, contendo ou uma URL
assinada de PUT (com o caminho do objeto e o prazo de expiração) em caso de sucesso,
ou um erro descritivo em caso de recusa. A falha de um item NÃO SHALL impedir a
emissão de URL para os demais itens válidos do mesmo lote. Cada item bem-sucedido
SHALL ter uma linha de arquivo `pending` inserida, seguindo o mesmo ciclo do envio
individual (PUT direto no storage → reconciliação em `POST /internal/storage-events`).
Referência: PRD US 3.1.

#### Scenario: Lote totalmente válido
- **WHEN** uma pessoa solicita o envio de vários arquivos válidos em uma requisição
- **THEN** recebe, para cada arquivo, uma URL assinada própria e independente, e cada
  arquivo pode ser enviado e concluído separadamente dos demais

#### Scenario: Falha parcial não derruba o lote
- **WHEN** um dos itens do lote é recusado (por exemplo, por estourar a cota) e os
  demais são válidos
- **THEN** os itens válidos recebem suas URLs e podem concluir normalmente, enquanto o
  item recusado é sinalizado com seu erro, sem afetar os que concluíram

#### Scenario: Nova tentativa apenas do item que falhou
- **WHEN** um item foi recusado ou falhou no envio e a pessoa reenvia somente aquele
  arquivo em uma nova requisição
- **THEN** o item é processado isoladamente, sem exigir o reenvio dos itens que já
  haviam concluído

### Requirement: Reserva de cota consciente do lote

Ao pré-checar a cota individual de 10 GB para um lote, o sistema SHALL considerar a
soma dos tamanhos declarados dos itens do próprio lote **e** dos envios ainda
pendentes do mesmo usuário, não apenas o volume já finalizado (`storage_used_bytes`).
Os itens que couberem dentro do limite SHALL receber URL; os que ultrapassarem o
limite SHALL ser sinalizados com erro de cota, sem impedir os itens que couberem.
Nenhuma linha de arquivo SHALL ser inserida para um item recusado por cota.
Referência: PRD US 3.1, US 8.1.

#### Scenario: Lote que excede a cota no conjunto
- **WHEN** os arquivos do lote cabem individualmente, mas a soma deles (com os envios
  pendentes) ultrapassa o limite de 10 GB do usuário
- **THEN** os primeiros itens que couberem recebem URL e os que excederem o limite são
  recusados com erro de cota, sem que nenhuma linha seja inserida para os recusados

#### Scenario: Item recusado por cota não consome reserva
- **WHEN** um item do lote é recusado por cota
- **THEN** nenhuma linha `pending` é criada para ele e o volume reservado do usuário
  não é acrescido por esse item

### Requirement: Teto de itens por requisição de envio em lote


O sistema SHALL recusar, em `POST /files/upload-urls`, qualquer requisição cuja
lista de itens exceda o teto configurado, respondendo com um código de erro
próprio que identifique o teto como causa. A recusa SHALL ocorrer **antes** de
qualquer efeito: nenhuma linha de arquivo `pending` SHALL ser inserida, nenhuma
pasta do caminho relativo SHALL ser criada e nenhuma URL assinada SHALL ser
emitida. O teto SHALL ser configurável por ambiente, no molde dos demais tetos
por requisição já existentes (manifesto de download, destinatários de concessão,
itens de movimentação em lote), e seu padrão SHALL ser conhecido também pelo
cliente, para que a recusa possa acontecer antes da requisição — sem que isso
dispense a validação no servidor. Referência: PRD US 3.1; design.md D2 do change
`corrige-defeitos-envio-lote`.

#### Scenario: Lote acima do teto é recusado sem efeito colateral
- **WHEN** uma pessoa solicita URLs de envio para uma quantidade de itens acima
  do teto configurado
- **THEN** a requisição é recusada com o código de erro próprio do teto, e nem
  arquivo pendente, nem pasta, nem URL assinada são criados

#### Scenario: Lote no teto é aceito normalmente
- **WHEN** uma pessoa solicita URLs de envio para exatamente a quantidade máxima
  permitida de itens válidos
- **THEN** a requisição é processada normalmente e cada item recebe seu
  resultado próprio

### Requirement: Recusa por requisição malformada distinguível de falha interna


O sistema SHALL responder a uma requisição cujo corpo exceda o tamanho máximo
aceito com um status próprio de corpo grande demais, e a uma requisição cujo
corpo não seja JSON válido com um status próprio de requisição inválida, em
ambos os casos com um código de erro estável — nunca com o status genérico de
falha interna do servidor. O tamanho máximo de corpo aceito SHALL ser
configurável por ambiente e SHALL ser folgado o bastante para acomodar o teto de
itens do envio em lote no pior caso de comprimento de nome e caminho relativo.

Falhas que **não** sejam de requisição malformada SHALL continuar respondendo
com o status genérico de falha interna, sem expor mensagem, tipo ou rastro do
erro original. A distinção SHALL cobrir somente as classes de erro de leitura do
corpo reconhecidas, nunca um status arbitrário carregado por um erro qualquer.
Referência: design.md D1 do change `corrige-defeitos-envio-lote`.

#### Scenario: Corpo grande demais é reportado como tal
- **WHEN** um cliente envia uma requisição cujo corpo excede o tamanho máximo
  aceito
- **THEN** a resposta indica corpo grande demais, com código de erro próprio, e
  o cliente consegue distinguir essa recusa de uma falha do servidor

#### Scenario: JSON inválido é reportado como requisição inválida
- **WHEN** um cliente envia uma requisição cujo corpo não é JSON válido
- **THEN** a resposta indica requisição inválida, com código de erro próprio, e
  não a falha interna genérica

#### Scenario: Falha interna permanece opaca
- **WHEN** uma requisição falha por um erro que não é de leitura do corpo
- **THEN** a resposta é a falha interna genérica, sem mensagem, tipo ou rastro
  do erro original
