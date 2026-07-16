# Proposal — epico-3-envio-lote-e-pasta

## Why

O Épico 2 (`epico-2-navegacao-arquivos-pastas`, arquivado) entregou a árvore —
pastas aninhadas, colocação de arquivo em pasta e envio **um arquivo por vez**
(`POST /files/upload-url`, com `folderId` opcional). Mas ingerir conteúdo real
é sempre em lote: selecionar vários arquivos, ou arrastar uma pasta inteira com
subpastas. Hoje o cliente teria de orquestrar isso na unha, e não há forma de
recriar a hierarquia de uma pasta enviada.

O Épico 3 do PRD (`docs/prd_final.md`, US 3.1, US 3.2 e US 3.3) cobre envio e
download em lote. Esta mudança entrega a fatia **de ingestão** — US 3.1 (envio
múltiplo com sucesso/falha independentes) e US 3.2 (envio de pasta preservando
subpastas), **somente backend/API**. A US 3.3 (baixar uma pasta como um único
arquivo compactado) é **deliberadamente adiada**: seu cenário 2 exige incluir no
ZIP "apenas os itens para os quais tenho permissão de baixar", e o motor de
permissão granular por item é o Épico 4, que ainda não existe — construir o
filtro agora seria construir algo que o Épico 4 reescreveria. Coerente com o
fatiamento já adotado nos Épicos 1 e 2 (backend primeiro, depender de permissão
fica para o Épico 4).

## What Changes

- **Envio em lote com resultado por item** (US 3.1): novo
  `POST /files/upload-urls` (plural) recebe uma lista de itens e devolve, **por
  item e de forma independente**, ou uma URL assinada de PUT (sucesso) ou um erro
  (ex.: cota) — sem que a falha de um item impeça os demais. Cada item continua
  seguindo o mesmo ciclo já existente (PUT direto no storage → reconciliação em
  `POST /internal/storage-events`), então progresso individual e nova tentativa
  **apenas do item que falhou** são propriedades naturais do contrato. O
  `POST /files/upload-url` (singular) permanece para o caso de arquivo único.
- **Reserva de cota consciente do lote** (US 3.1 / US 8.1): o pré-check de cota
  do lote SHALL considerar a soma dos tamanhos declarados dos itens do próprio
  lote (e das linhas `pending` já existentes do usuário), não apenas o
  `storage_used_bytes` finalizado — hoje N pedidos simultâneos veem o mesmo "uso
  atual" e todos passariam mesmo estourando 10 GB. Os itens que cabem recebem
  URL; os que estouram são sinalizados com erro de cota, sem bloquear os demais.
- **Envio de pasta preservando subpastas** (US 3.2): cada item do lote pode
  informar um `relativePath` (ex.: `Relatorios/2024`); o servidor **garante a
  árvore de pastas** correspondente sob a pasta de destino (ou a raiz), criando
  os níveis que faltam de forma **idempotente** e reaproveitando os existentes,
  antes de vincular o arquivo à pasta-folha. A hierarquia enviada é recriada
  idêntica dentro do sistema, dentro da mesma unidade e sob RLS.
- **Idempotência de pasta por nome** (suporte à US 3.2): para "garantir caminho"
  sem duplicar pastas em re-tentativas de lote, `folders` ganha unicidade de
  `name` por `(unit_id, parent_id)` (case-insensitive), respeitando a raiz
  (`parent_id` nulo). Migração `0006`, aditiva.
- **Nova migração `0006`** (não edita migrações aplicadas): índice único
  `(unit_id, parent_id, lower(name))` em `folders` para a criação idempotente de
  caminho.

## Capabilities

### New Capabilities

- `envio-lote`: emissão de URLs de envio para **vários arquivos em uma única
  requisição**, com resultado (URL assinada ou erro) independente por item e
  reserva de cota consciente do lote inteiro, de modo que falha parcial não
  derrube os demais e a nova tentativa seja só do item que falhou. Cobre US 3.1.

- `envio-pasta`: recriação **idempotente** da hierarquia de subpastas a partir do
  caminho relativo de cada arquivo enviado, sob a pasta de destino (ou raiz),
  isolada por unidade via RLS, preservando a estrutura original. Cobre US 3.2.

### Modified Capabilities

<!-- Nenhum requisito verificável já publicado muda. A capability `navegacao`
     (Épico 2) é reutilizada: o modelo de `folders` e a colocação de arquivo em
     pasta continuam válidos; esta mudança apenas os exercita em lote e adiciona
     unicidade de nome por pai, sem alterar os cenários já especificados. O fluxo
     de URL assinada e o mecanismo de tenancy (SET LOCAL por transação, RLS por
     unit_id) permanecem intactos. -->

## Impact

- **Código (apps/api):** extensão de `routes/files.ts` com
  `POST /files/upload-urls` (lote) — pré-check de cota somando o lote + pendentes,
  garantia de caminho de pastas por `relativePath`, inserção das linhas `pending`
  e assinatura das URLs, tudo por item; extração de um helper de "garantir árvore
  de pastas" (reutilizável a partir da lógica de `POST /folders` do Épico 2). A
  reconciliação em `routes/storage-events.ts` permanece inalterada (já é por
  objeto).
- **Banco:** migração `0006_folder_name_unique_per_parent.sql` — índice único
  `(unit_id, parent_id, lower(name))` em `folders`.
- **Contratos (packages/shared):** DTOs de envio em lote (item de entrada com
  `relativePath` opcional; item de saída com URL/objeto ou erro por arquivo).
- **Fora de escopo (mudanças futuras):** qualquer tela/SPA (`apps/web` segue
  reservado) — progresso visual por arquivo e barra de upload são consumo do
  contrato pelo frontend, não desta fatia; **download compactado de pasta**
  (US 3.3), que depende da permissão de download por item do Épico 4; permissões
  granulares (Épico 4); alcance administrativo sobre itens de terceiros (Épico 5);
  lixeira (Épico 6); busca e filtros (Épico 9).
