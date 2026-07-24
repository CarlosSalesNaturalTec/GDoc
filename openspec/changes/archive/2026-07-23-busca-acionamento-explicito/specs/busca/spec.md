## MODIFIED Requirements

### Requirement: Busca de arquivos por nome com filtros combináveis

O sistema SHALL expor uma consulta de busca transversal de **arquivos**
(atravessando pastas) por nome, combinável com filtros de tipo de arquivo,
autor e intervalo de data. A busca por nome SHALL fazer correspondência
**parcial** e insensível a caixa sobre o nome do arquivo. Cada filtro presente
SHALL restringir o resultado em **conjunção** (AND) com os demais e com o
alcance de permissão do solicitante. Os resultados SHALL vir ordenados do mais
recente para o mais antigo (`created_at` desc). Cobre **US 9.1**
(`docs/prd_final.md`).

O filtro de **tipo** SHALL usar uma categoria funcional derivada do
`content_type` do arquivo — imagens, vídeos, áudios, PDFs, documentos de
escritório (Word/Excel/PowerPoint) e demais — com o mapeamento categoria↔tipo
definido numa fonte única compartilhada entre servidor e cliente.

Entrada malformada (data inválida, categoria de tipo desconhecida ou
identificador de autor inválido) SHALL ser recusada com erro de validação, sem
executar a busca.

Uma requisição **sem nenhum filtro** SHALL continuar sendo válida e SHALL
retornar todos os arquivos visíveis ao solicitante — a decisão de **quando**
consultar é da interface, não do endpoint. A partir da change
`busca-acionamento-explicito`, a SPA deixa de emitir essa requisição sem
critérios (a tela de busca só consulta após acionamento explícito do usuário,
ver spec `web-busca`), mas o contrato do endpoint permanece inalterado.

#### Scenario: Busca com filtros combinados (US 9.1 cenário 1)
- **WHEN** o solicitante busca por um nome e aplica filtros de data, tipo e/ou
  autor
- **THEN** o sistema retorna apenas os arquivos que atendem a **todos** os
  critérios informados e para os quais ele tem permissão de ver, ordenados do
  mais recente para o mais antigo

#### Scenario: Busca por nome parcial
- **WHEN** o solicitante informa parte do nome de um arquivo
- **THEN** o sistema retorna os arquivos visíveis cujo nome contém o trecho
  informado, sem diferenciar maiúsculas de minúsculas

#### Scenario: Filtro por tipo derivado do content_type
- **WHEN** o solicitante filtra por uma categoria de tipo (por exemplo,
  imagens ou documentos de escritório)
- **THEN** o sistema retorna apenas os arquivos visíveis cujo `content_type`
  pertence àquela categoria

#### Scenario: Busca sem nenhum filtro retorna tudo o que é visível
- **WHEN** o solicitante executa a busca sem informar nenhum filtro
- **THEN** o sistema retorna todos os arquivos que ele tem permissão de ver, sem
  restrição adicional

#### Scenario: Entrada de filtro inválida
- **WHEN** o solicitante informa um filtro malformado (data inválida, categoria
  de tipo inexistente ou autor inválido)
- **THEN** o sistema recusa a requisição com erro de validação e não executa a
  busca
