# platform-infrastructure Specification

## Purpose

Define os requisitos verificáveis da fundação de infraestrutura do GDoc — os
trilhos sobre os quais as épicas do PRD serão construídas. Cobre armazenamento
privado, emissão de URLs assinadas com auditoria, isolamento por unidade,
paridade dev↔prod, segredos, jobs agendados e o pipeline de entrega. Não cobre
nenhuma feature de produto (login, navegador, permissões de negócio, painel),
que virão como mudanças próprias.
## Requirements
### Requirement: Armazenamento privado por padrão

O sistema SHALL armazenar os bytes dos arquivos em um bucket de object storage
sem qualquer acesso público, de modo que os objetos só sejam alcançáveis por
credenciais emitidas pelo backend após checagem de permissão.

#### Scenario: Bucket sem acesso público

- **WHEN** a infraestrutura de produção é provisionada
- **THEN** o bucket usa acesso uniforme em nível de bucket, não possui nenhum
  binding para `allUsers`/`allAuthenticatedUsers` e não expõe URL pública de objeto.

#### Scenario: Objeto inacessível sem URL assinada

- **WHEN** um objeto é requisitado diretamente pela sua URL de storage sem uma
  assinatura válida emitida pelo backend
- **THEN** o acesso é negado pelo storage e nenhum byte ou pré-visualização é retornado.

### Requirement: Emissão de URL assinada mediada por permissão e auditada

O sistema SHALL expor endpoints distintos de visualização e de download que,
antes de emitir uma URL assinada, validem a permissão correspondente no servidor
e registrem um evento de auditoria no momento da emissão.

#### Scenario: URL de visualização

- **WHEN** um usuário com permissão de visualizar solicita a URL de um arquivo
- **THEN** o backend registra um evento de auditoria `view` (usuário, arquivo,
  data/hora) e retorna uma URL assinada com disposição `inline` e TTL de ~5 min.

#### Scenario: URL de download

- **WHEN** um usuário com permissão de baixar solicita a URL de um arquivo
- **THEN** o backend registra um evento de auditoria `download` e retorna uma URL
  assinada com disposição `attachment` e TTL de ~15–30 min.

#### Scenario: Solicitação sem permissão

- **WHEN** um usuário sem a permissão exigida solicita a URL de um arquivo
- **THEN** o backend nega a solicitação, não emite URL assinada e não registra
  evento de acesso ao conteúdo.

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

### Requirement: Isolamento por unidade imposto no banco

O sistema SHALL isolar os dados por unidade no nível do banco de dados via
Row-Level Security sobre uma coluna de unidade, de forma que consultas da
aplicação não possam retornar dados de outra unidade, com exceção do papel de
administrador global.

#### Scenario: Consulta restrita à própria unidade

- **WHEN** uma requisição de um colaborador ou administrador de unidade executa
  qualquer consulta em tabelas com escopo de unidade
- **THEN** o banco retorna apenas linhas cuja unidade corresponde à do usuário,
  mesmo que a consulta da aplicação não filtre explicitamente por unidade.

#### Scenario: Administrador global agrega todas as unidades

- **WHEN** uma requisição de administrador global consulta tabelas com escopo de unidade
- **THEN** as políticas de RLS permitem agregação sobre todas as unidades.

#### Scenario: Contexto de unidade seguro sob pooling

- **WHEN** a aplicação define o contexto de unidade e papel da requisição
- **THEN** ele é aplicado por transação (`SET LOCAL`), não vazando entre requisições
  que compartilham a mesma conexão do pool.

### Requirement: Prefixo de unidade no storage

O sistema SHALL organizar os objetos sob um prefixo por unidade, de modo que o
caminho de qualquer objeto seja derivado do contexto de unidade autenticado.

#### Scenario: Caminho de objeto com prefixo de unidade

- **WHEN** o backend determina o caminho de um objeto para upload
- **THEN** o caminho é prefixado pelo identificador da unidade do usuário
  (ex.: `/{unit_id}/{owner_id}/{uuid}`).

### Requirement: Paridade de ambientes por seams de configuração

O sistema SHALL executar o mesmo código de aplicação nos ambientes de
desenvolvimento (sandbox) e de produção (GCP), trocando apenas configuração,
por meio de interfaces (seams) para storage, banco, segredos e autenticação.

#### Scenario: Storage trocado por configuração

- **WHEN** a aplicação roda no sandbox com o emulador de storage e em produção com
  o storage do GCP
- **THEN** o mesmo código do `StoragePort` opera nos dois ambientes, selecionado
  por variável de ambiente, sem ramificação específica de provedor no código de negócio.

#### Scenario: Isolamento testável no sandbox

- **WHEN** os testes de isolamento por unidade rodam contra o Postgres local do sandbox
- **THEN** as mesmas políticas de RLS de produção são exercidas e um usuário de uma
  unidade não consegue acessar dados de outra.

### Requirement: Provisionamento idempotente do ambiente de desenvolvimento

O sistema SHALL prover um hook de início de sessão que provisione a infraestrutura
de desenvolvimento de forma idempotente e reproduzível a cada sessão efêmera.

#### Scenario: Provisionamento repetível

- **WHEN** o hook de início de sessão executa em uma sessão nova
- **THEN** ele instala dependências, sobe o banco local, aplica migrações, executa
  seed apenas se necessário e sobe o emulador de storage com o bucket criado,
  deixando testes e linters aptos a rodar.

#### Scenario: Reexecução sem efeito colateral

- **WHEN** o hook executa novamente com os serviços já no ar
- **THEN** ele detecta o estado atual e não duplica serviços nem recria dados de seed.

### Requirement: Gestão de segredos e senhas

O sistema SHALL obter segredos de um cofre gerenciado em produção e de configuração
local no desenvolvimento, e SHALL armazenar senhas apenas como hash.

#### Scenario: Origem de segredos por ambiente

- **WHEN** a aplicação inicia em produção
- **THEN** os valores sensíveis vêm do Secret Manager; no sandbox, das variáveis de
  ambiente locais, atrás do mesmo `SecretsPort`.

#### Scenario: Senha nunca em texto puro

- **WHEN** uma senha de usuário é persistida
- **THEN** ela é armazenada como hash (argon2) e nunca em texto puro.

### Requirement: Infraestrutura de jobs agendados

O sistema SHALL prover o encanamento de execução agendada para as rotinas de
retenção e expiração, sem implementar sua lógica de negócio nesta mudança.

#### Scenario: Agendamento provisionado

- **WHEN** a infraestrutura de produção é provisionada
- **THEN** existe um agendador disparando jobs em container, incluindo um disparo
  diário às 03:00, com um alvo de job de exemplo que executa e registra sucesso.

### Requirement: Pipeline de build e deploy

O sistema SHALL prover um pipeline que valide, empacote e publique a imagem da
aplicação e a implante no ambiente de execução gerenciado.

#### Scenario: Pipeline ponta a ponta

- **WHEN** o pipeline roda para uma mudança na branch alvo
- **THEN** ele executa lint, build e testes, publica a imagem no registro de
  artefatos e implanta o serviço no runtime gerenciado.

### Requirement: Prova de fundação ponta a ponta

O sistema SHALL incluir uma verificação mínima que exercite storage e banco em
ambos os ambientes, sem implementar qualquer feature do PRD.

#### Scenario: Saúde e fluxo mínimo

- **WHEN** a prova de fundação executa
- **THEN** um endpoint de saúde responde e um fluxo mínimo de upload → emissão de
  URL assinada → download conclui com sucesso, exercitando storage e banco.

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

