## ADDED Requirements

### Requirement: Visualização inline de arquivo pré-visualizável

A partir do explorador, a SPA SHALL permitir **visualizar** um arquivo sem
baixá-lo, abrindo um preview (via clique no nome do arquivo ou em uma ação
"Visualizar"). Ao abrir, a SPA SHALL chamar `POST /files/:id/view-url` **uma
vez**. Quando a resposta for `previewAvailable: true`, a SPA SHALL renderizar o
conteúdo **inline** usando a URL assinada retornada, escolhendo o elemento de
apresentação a partir da categoria de MIME do arquivo
(`fileCategory(contentType)` de `@gdoc/shared`): imagem, vídeo, áudio, PDF ou
texto — sem que o arquivo seja transferido como download. Reabrir o preview
SHALL emitir uma nova chamada (nova URL assinada).

Referência: PRD US 9.2 (cenário 1), RF #16; design.md D1/D2/D3.

#### Scenario: Visualizar arquivo em formato suportado
- **WHEN** o usuário abre a visualização de um arquivo pré-visualizável (PDF,
  imagem, vídeo, áudio ou texto) sobre o qual tem permissão
- **THEN** a SPA obtém a URL assinada via `POST /files/:id/view-url` e exibe o
  conteúdo diretamente na tela, sem baixar o arquivo

#### Scenario: Elemento de apresentação escolhido pela categoria do arquivo
- **WHEN** a resposta do preview é `previewAvailable: true`
- **THEN** a SPA renderiza uma imagem como imagem, um PDF ou texto em visualizador
  embutido, e vídeo/áudio com controles de reprodução, conforme a categoria de
  MIME do arquivo, apontando para a URL assinada

### Requirement: Formato sem pré-visualização informa indisponibilidade e oferece download conforme permissão

Quando `POST /files/:id/view-url` responder `previewAvailable: false`
(`reason: 'unsupported_format'`), a SPA SHALL informar que a **pré-visualização
não está disponível** e SHALL oferecer o **download apenas quando**
`download.available` for `true`. Quando `download.available` for `false`, a SPA
SHALL exibir somente a mensagem de indisponibilidade, sem botão de download.
Nenhum conteúdo do arquivo SHALL ser renderizado nesse caso. Documentos de
escritório (Word/Excel/PowerPoint) recaem neste comportamento enquanto o backend
não os marcar como pré-visualizáveis, sem tratamento especial no cliente.

Referência: PRD US 9.2 (cenário 2), RF #16; design.md D5.

#### Scenario: Formato não suportado com permissão de download
- **WHEN** o usuário tenta visualizar um arquivo cujo formato não tem
  pré-visualização e a resposta traz `download.available: true`
- **THEN** a SPA informa que a pré-visualização está indisponível e oferece um
  botão de download

#### Scenario: Formato não suportado sem permissão de download
- **WHEN** o usuário tenta visualizar um arquivo sem pré-visualização e a
  resposta traz `download.available: false`
- **THEN** a SPA informa que a pré-visualização está indisponível e não exibe
  botão de download

### Requirement: Download de arquivo por URL assinada

A SPA SHALL oferecer uma ação de **baixar** por arquivo que chama
`POST /files/:id/download-url` e, ao receber a URL assinada, dispara o download
por **navegação simples** para essa URL (a resposta do servidor usa disposição
`attachment`), sem transferir os bytes através da própria aplicação. A ação de
download do ramo de indisponibilidade (formato não suportado com
`download.available: true`) SHALL usar o mesmo fluxo.

Referência: PRD US 9.2, RF #16; design.md D4.

#### Scenario: Baixar arquivo com permissão
- **WHEN** o usuário aciona o download de um arquivo sobre o qual tem permissão
- **THEN** a SPA obtém a URL assinada via `POST /files/:id/download-url` e o
  browser inicia o download do arquivo

### Requirement: Acesso a arquivo sem permissão é bloqueado sem expor preview

Quando o servidor responder **403** a `POST /files/:id/view-url` ou
`POST /files/:id/download-url` (arquivo inexistente, de outra unidade ou sem a
concessão do verbo correspondente), a SPA SHALL exibir um aviso de **permissão
insuficiente** e NÃO SHALL renderizar qualquer conteúdo do arquivo. Uma resposta
**401** SHALL continuar sendo tratada centralmente, encerrando a sessão e
redirecionando a `/login`.

Referência: PRD US 9.2, RF #10; design.md D6.

#### Scenario: Visualização sem permissão não expõe conteúdo
- **WHEN** o usuário tenta visualizar ou baixar um arquivo para o qual não tem
  permissão e a API responde 403
- **THEN** a SPA exibe um aviso de permissão insuficiente e nenhum conteúdo do
  arquivo é mostrado
