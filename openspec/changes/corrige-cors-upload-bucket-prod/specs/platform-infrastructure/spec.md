## ADDED Requirements

### Requirement: CORS do bucket autoriza a origem do SPA em produção

A configuração de CORS do bucket de arquivos SHALL autorizar a(s) origem(ns) do
SPA em produção nos métodos usados pelo upload/download direto (`GET`, `PUT`,
`HEAD`), de modo que o preflight `OPTIONS` do navegador retorne
`Access-Control-Allow-Origin` e a transferência direta ao storage conclua sem ser
bloqueada pela política de CORS. Como em produção a SPA é servida pela própria API
no Cloud Run (mesma origem), a origem autorizada é a(s) URL(s) do serviço Cloud
Run da API; enquanto o serviço for exposto por mais de uma forma de URL, **todas**
SHALL constar na lista de origens autorizadas.

#### Scenario: Upload direto do SPA de produção conclui o preflight

- **WHEN** o SPA carregado a partir de uma URL de produção do serviço Cloud Run
  faz um `PUT` cross-origin de um arquivo na URL assinada emitida pelo backend
- **THEN** o preflight `OPTIONS` do bucket responde com
  `Access-Control-Allow-Origin` correspondente à origem do SPA e o `PUT` dos bytes
  é aceito pelo storage.

#### Scenario: Origem não autorizada continua bloqueada

- **WHEN** uma origem que não é uma origem configurada do SPA tenta um `PUT`/`GET`
  cross-origin no bucket
- **THEN** o bucket não retorna `Access-Control-Allow-Origin` para essa origem e o
  navegador bloqueia a requisição — o CORS não amplia o acesso além das origens
  explicitamente autorizadas, e a privacidade do bucket (sem acesso público)
  permanece intacta.
