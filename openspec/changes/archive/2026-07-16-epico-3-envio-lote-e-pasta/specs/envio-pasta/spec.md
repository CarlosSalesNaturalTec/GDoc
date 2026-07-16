# Spec — envio-pasta (delta)

Capability nova. Implementa o Épico 3 / **US 3.2** do PRD (`docs/prd_final.md`).
Os cenários Given/When/Then da US são vinculantes; os requisitos abaixo os tornam
verificáveis no backend. Reutiliza o modelo de `folders` já especificado na
capability `navegacao` (Épico 2) — aqui a árvore é recriada em lote a partir dos
caminhos relativos dos arquivos enviados.

## ADDED Requirements

### Requirement: Recriação idempotente da hierarquia de pastas no envio

Ao enviar em lote, cada item PODE informar um caminho relativo (`relativePath`) que
descreve a subpasta em que o arquivo deve residir dentro da pasta de destino (ou da
raiz da unidade, quando não houver pasta de destino). O sistema SHALL **garantir** a
existência de toda a cadeia de pastas desse caminho, criando os níveis que faltarem e
reaproveitando os que já existirem, e SHALL vincular o arquivo à pasta-folha
resultante. A criação de caminho SHALL ser **idempotente**: reenviar o mesmo lote NÃO
SHALL duplicar pastas. Todas as pastas criadas SHALL pertencer à unidade do remetente
e residir sob a pasta de destino informada, com o isolamento entre unidades imposto
por RLS. Referência: PRD US 3.2.

#### Scenario: Estrutura de subpastas preservada
- **WHEN** uma pessoa envia arquivos cujos caminhos relativos descrevem uma pasta com
  subpastas (por exemplo, `Relatorios/2024/arquivo.pdf` e `Relatorios/2025/outro.pdf`)
- **THEN** a hierarquia de subpastas é recriada de forma idêntica dentro do sistema e
  cada arquivo passa a residir na subpasta correspondente ao seu caminho

#### Scenario: Reaproveitamento de pasta existente
- **WHEN** parte do caminho relativo de um item já existe como pasta na unidade
- **THEN** as pastas existentes são reaproveitadas e apenas os níveis faltantes são
  criados, sem duplicar as pastas já presentes

#### Scenario: Reenvio do mesmo lote não duplica pastas
- **WHEN** uma pessoa reenvia um lote com os mesmos caminhos relativos de um envio
  anterior
- **THEN** nenhuma pasta é duplicada e a árvore resultante permanece idêntica

### Requirement: Envio de pasta ancorado no destino e isolado por unidade

Quando o lote informar uma pasta de destino, a árvore recriada a partir dos caminhos
relativos SHALL ser ancorada **sob essa pasta de destino**, e a pasta de destino SHALL
pertencer à mesma unidade do remetente. Um caminho relativo que aponte para fora da
unidade ou uma pasta de destino de outra unidade NÃO SHALL ser utilizável, sem revelar
a existência de conteúdo de outra unidade. Referência: PRD US 3.2.

#### Scenario: Árvore ancorada na pasta de destino
- **WHEN** uma pessoa envia uma pasta informando uma pasta de destino da sua unidade
- **THEN** a hierarquia enviada é recriada dentro dessa pasta de destino, preservando
  a estrutura relativa dos arquivos

#### Scenario: Pasta de destino de outra unidade não é utilizável
- **WHEN** uma pessoa tenta enviar uma pasta apontando como destino uma pasta de outra
  unidade
- **THEN** a operação é recusada e nenhuma pasta ou arquivo é criado, sem revelar a
  existência da pasta de outra unidade
