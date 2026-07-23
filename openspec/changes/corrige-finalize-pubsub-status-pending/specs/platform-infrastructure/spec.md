## MODIFIED Requirements

### Requirement: Controle de cota em upload direto

O sistema SHALL impor a cota de armazenamento por pessoa mesmo quando o upload
é feito direto ao storage, combinando pré-checagem na emissão e reconciliação
após a finalização do objeto. A reconciliação SHALL aceitar o transporte de
notificação usado em produção — a entrega push do Pub/Sub, cujo corpo é o
envelope `{ message: { data } }` com o metadata do objeto do GCS codificado em
base64 — e SHALL autenticar essa notificação antes de tocar em qualquer dado. Ao
reconciliar um objeto recém-finalizado, o sistema SHALL tornar o arquivo
correspondente consultável (status ativo), de modo que um upload concluído deixe
de ficar pendente indefinidamente.

#### Scenario: Pré-checagem bloqueia estouro declarado

- **WHEN** um usuário solicita URL de upload cujo tamanho declarado somado ao uso
  atual excede a cota
- **THEN** o backend recusa a emissão da URL e informa que a cota seria excedida.

#### Scenario: Reconciliação após finalização em produção

- **WHEN** o objeto termina de ser enviado ao storage e a notificação de
  finalização chega no formato de produção (envelope de push do Pub/Sub com o
  metadata do objeto do GCS)
- **THEN** o backend decodifica a notificação, identifica o arquivo pelo caminho
  do objeto, atualiza o uso real da pessoa, torna o arquivo ativo/consultável e
  sinaliza/remove o objeto caso o limite tenha sido ultrapassado.

#### Scenario: Notificação de finalização não autenticada é recusada

- **WHEN** uma requisição chega ao endpoint de finalização sem uma credencial de
  notificação válida (token OIDC ausente, com assinatura inválida ou com audience
  incorreta)
- **THEN** o backend recusa a requisição sem alterar cota nem status de nenhum
  arquivo.

#### Scenario: Notificação de objeto desconhecido é reconhecida sem reprocessar

- **WHEN** a notificação de finalização se refere a um objeto que não corresponde
  a nenhum arquivo pendente (por exemplo, evento duplicado tardio ou objeto já
  reconciliado)
- **THEN** o backend reconhece a notificação como processada — sem reter a
  mensagem em retentativa infinita — e não altera cota nem status.
