## ADDED Requirements

### Requirement: Região dos recursos regionais parametrizada e única

A infraestrutura de produção SHALL provisionar todos os recursos regionais
(Cloud Run, Cloud SQL, buckets do Cloud Storage, Artifact Registry, Cloud
Scheduler/Jobs e NEG serverless) a partir de um único parâmetro de região no
Terraform (`var.region`, fonte da verdade) — nenhum recurso SHALL referenciar
região literal. Na fase de testes a região ativa SHALL ser `us-central1`, por
custo; a configuração SHALL registrar, por anotação adjacente ao parâmetro, o
trade-off de latência para usuários no Brasil e o gatilho de reavaliação da
região antes de operar com carga real sensível a latência.

#### Scenario: Região única aplicada a todos os recursos regionais

- **WHEN** a infraestrutura de produção é provisionada com
  `region = "us-central1"`
- **THEN** todos os recursos regionais nascem em `us-central1` e um
  `terraform plan` subsequente não acusa diferença de região em nenhum recurso.

#### Scenario: Anotação de latência e gatilho de retorno

- **WHEN** a região ativa é distante dos usuários por decisão de custo
- **THEN** a definição do parâmetro de região carrega anotação explícita do
  trade-off de latência e do gatilho que dispara a reavaliação (carga/uso real
  sensível a latência), de modo que qualquer troca futura de região encontre o
  registro no próprio ponto de mudança.

### Requirement: Troca de região reconcilia os artefatos derivados da URL do serviço

Uma troca de região da infraestrutura de produção SHALL reconciliar, como parte
da própria mudança, todos os artefatos derivados da URL do serviço Cloud Run —
que muda junto com a região: as origens autorizadas no CORS do bucket de
arquivos (ambas as formas de URL expostas pelo Cloud Run), o audience da
validação OIDC do push do Pub/Sub e a variável de região consumida pelo
pipeline de CI/CD. O ambiente recriado SHALL passar pelo bootstrap do
administrador global (migrações + criação do `global_admin` via Job) antes de
ser considerado operacional, e os invariantes de segurança existentes (bucket
privado, URL assinada só após checagem de permissão, RLS por `unit_id`) SHALL
permanecer válidos sem exceção durante e após a troca.

#### Scenario: Upload direto funcional pelas duas formas de URL

- **WHEN** a troca de região é concluída e a SPA é aberta por qualquer uma das
  duas formas de URL do serviço Cloud Run
- **THEN** o preflight CORS do upload direto ao bucket é aceito e o envio de
  arquivo completa com sucesso.

#### Scenario: Reconciliação de cota ativa no ambiente novo

- **WHEN** um upload é finalizado no bucket recriado com a validação OIDC
  ligada para o audience novo
- **THEN** o push do Pub/Sub é aceito (não 401) e o arquivo sai do estado
  `pending` com a cota do dono reconciliada.

#### Scenario: Pipeline de deploy aponta para a região nova

- **WHEN** o pipeline de CI/CD roda após a troca de região
- **THEN** a imagem é publicada no Artifact Registry da região nova e o deploy
  atualiza o serviço Cloud Run da região nova, sem referência à região antiga.

#### Scenario: Ambiente recriado nasce fail-closed

- **WHEN** a infraestrutura é recriada na região nova e o bootstrap ainda não
  foi executado
- **THEN** não existe nenhuma conta utilizável e um acesso direto a objeto do
  bucket sem URL assinada é negado sem retornar bytes ou preview.
