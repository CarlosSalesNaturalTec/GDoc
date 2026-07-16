# Spec — envio-lote (delta)

Capability nova. Implementa o Épico 3 / **US 3.1** do PRD (`docs/prd_final.md`).
Os cenários Given/When/Then da US são vinculantes; os requisitos abaixo os tornam
verificáveis no backend. A camada visual (barra de progresso por arquivo) é consumo
do contrato pelo frontend e está fora desta fatia — o que o backend garante é que o
resultado de cada item é **independente** dos demais e que a nova tentativa pode ser
só do item que falhou.

## ADDED Requirements

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
