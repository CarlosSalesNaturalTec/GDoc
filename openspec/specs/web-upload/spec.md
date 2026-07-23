# web-upload Specification

## Purpose

Define os requisitos verificáveis do envio de arquivos na SPA do GDoc, a
partir do explorador (change `web-navegacao`): seleção múltipla de arquivos e
seleção de pasta inteira, pedido de URLs assinadas em **lote** via
`POST /files/upload-urls` (um pedido por lote, um item por arquivo) e PUT
direto de cada arquivo ao GCS pela URL assinada retornada, com progresso,
desfecho e nova tentativa **independentes por item**. Cobre o lado de
frontend da **US 3.1** (progresso e falha independentes, aviso de cota) e da
**US 3.2** (envio de pasta preservando a hierarquia de subpastas) e dos
**RF #6/#13** do PRD (`docs/prd_final.md`), consumindo o endpoint já pronto
em `apps/api/src/routes/files.ts` sem re-descrever seus cenários de backend
(ver capabilities `envio-lote`/`envio-pasta`).

## Requirements

### Requirement: Envio de múltiplos arquivos com progresso individual

A partir do explorador, a SPA SHALL permitir selecionar **vários arquivos** e
enviá-los para a pasta corrente. Para iniciar o envio, a SPA SHALL chamar
`POST /files/upload-urls` **uma vez**, com `destinationFolderId` igual à pasta
corrente (ausente na raiz da unidade) e **um item por arquivo** selecionado
(`fileName`, `contentType`, `declaredSizeBytes`). Para cada item aceito
(`ok: true`), a SPA SHALL transferir os bytes por **PUT direto ao GCS** na URL
assinada retornada e SHALL exibir o **progresso próprio de cada arquivo**. O
desfecho (sucesso ou falha) de cada arquivo SHALL ser apresentado **de forma
independente dos demais**.

Referência: PRD US 3.1 (cenário 1), RF #6; design.md D1/D2/D3.

#### Scenario: Progresso individual de cada arquivo do lote
- **WHEN** o usuário seleciona vários arquivos e inicia o envio
- **THEN** a SPA pede as URLs assinadas em uma única chamada e cada arquivo
  exibe seu próprio progresso de transferência, sinalizando sucesso ou falha ao
  final, independentemente dos demais

#### Scenario: Bytes transferidos direto ao GCS pela URL assinada
- **WHEN** um item do lote é aceito pelo servidor com uma URL assinada
- **THEN** a SPA envia os bytes desse arquivo por PUT diretamente à URL assinada
  do GCS, sem trafegar o conteúdo pela própria aplicação

### Requirement: Falha independente com nova tentativa apenas do item afetado

O envio de cada arquivo SHALL falhar de forma **isolada**: uma falha — seja
por o servidor recusar o item (`ok: false`, ex.: cota) seja por o PUT ao GCS não
concluir — NÃO SHALL impedir os demais arquivos do mesmo lote de concluir. Os
arquivos que concluíram SHALL permanecer enviados. Um arquivo que falhou SHALL
ser **sinalizado** e SHALL oferecer **nova tentativa que reenvia apenas aquele
item**, sem reprocessar os que já concluíram.

Referência: PRD US 3.1 (cenário 2), RF #6; design.md D3/D4.

#### Scenario: Falha parcial preserva os concluídos
- **WHEN** um dos arquivos falha durante o envio enquanto os demais concluem
- **THEN** os que concluíram permanecem enviados e o que falhou é sinalizado

#### Scenario: Repetir reenvia só o item que falhou
- **WHEN** o usuário aciona a nova tentativa de um arquivo que falhou
- **THEN** a SPA reenvia apenas aquele arquivo, sem reprocessar os que já
  concluíram

### Requirement: Envio de pasta preservando a hierarquia de subpastas

A SPA SHALL permitir selecionar uma **pasta inteira** para envio. Para cada
arquivo da seleção, a SPA SHALL derivar o **`relativePath`** a partir do
caminho relativo da pasta selecionada (o trecho de diretório, incluindo o nome
da pasta-raiz e excluindo o nome do arquivo) e o SHALL enviar no item
correspondente de `POST /files/upload-urls`. A SPA SHALL confiar na recriação
da cadeia de subpastas pelo servidor sob a pasta corrente, de modo que a
**hierarquia original seja preservada de forma idêntica**.

Referência: PRD US 3.2 (cenário 1), RF #6; design.md D5.

#### Scenario: Estrutura de subpastas recriada de forma idêntica
- **WHEN** o usuário seleciona uma pasta com subpastas e conclui o envio
- **THEN** a SPA envia cada arquivo com o `relativePath` correspondente e a
  hierarquia de subpastas e arquivos é recriada de forma idêntica dentro da
  pasta corrente

### Requirement: Aviso reativo ao atingir a cota

A SPA SHALL exibir um **aviso** informando que a cota de armazenamento foi
atingida sempre que o servidor recusar um item com erro de **cota excedida**
(`ok: false` com `error` de cota) e SHALL marcar **apenas aquele item** como
falho, deixando os demais itens do lote seguir. A SPA NÃO SHALL inferir a cota
localmente; o limite é decidido e reservado pelo servidor.

Referência: PRD US 3.1, RF #13; design.md D4.

#### Scenario: Item recusado por cota é sinalizado sem derrubar o lote
- **WHEN** o servidor recusa um dos arquivos por cota excedida
- **THEN** a SPA exibe um aviso de cota atingida, marca aquele arquivo como
  falho e os demais arquivos do lote continuam podendo concluir

### Requirement: Arquivo enviado aparece como pendente até a reconciliação

Após a conclusão bem-sucedida do PUT ao GCS, a SPA SHALL considerar o arquivo
**enviado** e SHALL **invalidar a listagem** da pasta corrente, sem aguardar a
promoção do arquivo a `active`. A reconciliação de estado
(`pending`→`active`) e a atualização da cota ocorrem **fora da SPA**
(reconciliação por notificação de finalização). A SPA NÃO SHALL fazer polling à
espera do estado `active`; o arquivo recém-enviado SHALL ser exibido na listagem
com seu estado atual (ex.: `pending`) conforme retornado pelo servidor.

Referência: PRD US 3.1, RF #6; design.md D6.

#### Scenario: Listagem reflete o arquivo recém-enviado sem polling
- **WHEN** o PUT de um arquivo ao GCS conclui com sucesso
- **THEN** a SPA marca o arquivo como enviado e recarrega a listagem da pasta, e
  o arquivo aparece com o estado retornado pelo servidor, sem que a SPA fique
  aguardando a promoção a `active`

### Requirement: Falha ao obter as URLs de envio é tratada sem bloquear a navegação

A SPA SHALL exibir um aviso de **permissão insuficiente** ou destino
indisponível e NÃO SHALL iniciar transferência alguma quando
`POST /files/upload-urls` responder erro de destino (**404** destino inexistente
ou **403** sem permissão sobre a pasta de destino). Uma resposta **401** SHALL
continuar sendo tratada centralmente, encerrando a sessão e redirecionando a
`/login`.

Referência: PRD US 3.1, RF #10; design.md D4/D7.

#### Scenario: Destino sem permissão bloqueia o lote inteiro
- **WHEN** o usuário tenta enviar para uma pasta sobre a qual não tem permissão
  e a API responde 403 ao pedido de URLs
- **THEN** a SPA exibe um aviso de permissão insuficiente e nenhum arquivo é
  transferido
