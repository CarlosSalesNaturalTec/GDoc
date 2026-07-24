## MODIFIED Requirements

### Requirement: Pipeline de build e deploy

O sistema SHALL prover um pipeline que valide, empacote e publique a imagem da
aplicação e a implante no ambiente de execução gerenciado. O pipeline SHALL
**aplicar as migrações de banco pendentes antes de trocar o tráfego** para a
revisão nova, de modo que a revisão implantada nunca suba contra um schema
desatualizado. A aplicação das migrações SHALL ser idempotente — aplicar somente
as pendentes e ser no-op quando não houver nenhuma — e SHALL rodar como um job em
container reusando a mesma imagem, service account e integração de banco da
aplicação. O pipeline SHALL **pular o build, a publicação da imagem e a implantação
quando o conjunto de arquivos alterados na branch alvo for exclusivamente de
documentação** (arquivos `*.md`, `docs/`, artefatos OpenSpec e `LICENSE`); se
qualquer arquivo alterado estiver fora desse conjunto, o pipeline SHALL implantar
normalmente (padrão fail-safe). O gate de documentação SHALL residir no pipeline
de entrega, nunca desabilitando as verificações de CI (lint/build/test) que
servem de required check.

#### Scenario: Pipeline ponta a ponta com migrações

- **WHEN** o pipeline roda para uma mudança de código na branch alvo
- **THEN** ele executa lint, build e testes, publica a imagem no registro de
  artefatos, aplica as migrações de banco pendentes e só então implanta o serviço
  no runtime gerenciado.

#### Scenario: Sem migração pendente

- **WHEN** o pipeline roda e não há migração de banco pendente
- **THEN** o passo de migração conclui com sucesso sem alterar o schema (no-op) e
  a implantação prossegue.

#### Scenario: Migração falha aborta a implantação

- **WHEN** a aplicação das migrações pendentes falha
- **THEN** o pipeline interrompe antes do `deploy`, o tráfego permanece na revisão
  anterior e a falha é reportada.

#### Scenario: Merge docs-only não implanta

- **WHEN** o pipeline é acionado por um merge cujos arquivos alterados são todos de
  documentação (`*.md`, `docs/`, artefatos OpenSpec, `LICENSE`)
- **THEN** o pipeline não builda, não publica imagem nem implanta, e registra que
  pulou por ser docs-only.

#### Scenario: Merge misto implanta

- **WHEN** o pipeline é acionado por um merge que altera pelo menos um arquivo fora
  do conjunto de documentação
- **THEN** o pipeline builda, publica, aplica migrações pendentes e implanta
  normalmente.
