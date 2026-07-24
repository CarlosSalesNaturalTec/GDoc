## Why

A página `/busca` da SPA consulta o servidor **assim que é aberta**: o estado dos controles alimenta a `queryKey` diretamente (`BuscaPage.tsx:62-65`), então o primeiro render dispara `GET /files/search` **sem critério algum** — e o servidor devolve, corretamente, *todos* os arquivos visíveis ao usuário. O resultado é uma tela que despeja o acervo inteiro antes de o usuário pedir qualquer coisa: ruidosa, cara à medida que o acervo cresce e confusa (a lista exibida não corresponde a nenhuma intenção de busca). O mesmo acoplamento faz cada tecla digitada no campo de nome virar uma requisição, sem debounce.

A busca deve começar **vazia** e só consultar quando o usuário definir o que procura e acionar a busca explicitamente.

## What Changes

- **Acionamento explícito**: novo botão **"Buscar"** na barra de filtros. Alterar os controles deixa de disparar consulta; a consulta só ocorre ao acionar o botão (ou pressionar **Enter** no campo de nome, via `onSearch` do `Input.Search` que já existe).
- **Nenhuma consulta ao carregar**: ao abrir `/busca`, nenhuma requisição a `GET /files/search` é feita. A tela exibe um **estado inicial** convidando a informar um critério.
- **Botão desabilitado sem critério**: enquanto nenhum critério estiver ativo (nome com conteúdo após `trim`, tipo, intervalo de data ou autor), o botão "Buscar" fica desabilitado — fechando a porta de "listar o acervo inteiro" pela tela de busca. Um nome de **1 caractere já conta** como critério (sem mínimo de caracteres: como o acionamento é explícito, não há rajada de requisições a evitar).
- **BREAKING (comportamento de spec `web-busca`)**: **"Limpar filtros"** deixa de refazer a busca sem critérios e passa a **voltar ao estado inicial vazio**, limpando controles *e* resultados, **sem consultar** o servidor.
- **Estado inicial distinto de "nenhum resultado"**: hoje só existe o `Empty` "Nenhum resultado". Passam a ser dois estados visualmente distintos — "informe um critério para buscar" (nunca consultou) e "nenhum resultado" (consultou e veio vazio) —, evitando que o usuário conclua que não há arquivo algum.
- **Filtros alterados após uma busca mantêm a lista anterior**, sem aviso de desatualizado: os resultados só mudam quando o usuário aciona "Buscar" novamente.
- **Backend inalterado**: `GET /files/search` continua aceitando busca sem critérios e devolvendo tudo o que o solicitante pode ver — essa é a semântica correta do endpoint e permanece coberta pelos testes de `busca`. A trava é exclusivamente de UX na SPA.

## Capabilities

### New Capabilities

Nenhuma. A mudança é inteiramente de comportamento de uma capability já entregue.

### Modified Capabilities

- `web-busca`: o requisito **"Botão de limpar filtros retorna ao estado inicial permitido"** muda de sentido — "estado inicial permitido" deixa de ser "a lista de todos os arquivos visíveis" e passa a ser "nenhum resultado exibido, nada consultado". Entram requisitos novos de **acionamento explícito da busca** (botão + Enter, desabilitado sem critério, nenhuma consulta ao carregar) e de **estado inicial distinto do estado sem resultados**.
- `busca`: **sem mudança de comportamento do servidor**. Apenas o cenário `Limpar filtros volta ao estado inicial permitido` é reescrito — ele descreve o endpoint (busca sem filtros retorna tudo o que é visível, o que continua valendo), mas hoje se amarra à US 9.1 cenário 2, que passa a descrever outra coisa na tela.

## Impact

- **web**: `apps/web/src/busca/BuscaPage.tsx` (separação entre estado dos controles e critério submetido, botão "Buscar", estado inicial, "Limpar filtros" sem consulta) e `apps/web/src/busca/queries.ts` (`useSearchFiles` passa a receber `enabled`). Testes de `apps/web/src/__tests__` da busca atualizados.
- **api**: nenhum. `GET /files/search`, `lib/search-filters.ts` e os testes de backend permanecem intactos.
- **shared**: nenhum.
- **infra**: nenhum. Não há prefixo de API novo — a invariante de sincronia entre `api-prefixes.ts`, `vite.config.ts` e `locals.tf` não é tocada.
- **Rastreabilidade (PRD)**: reinterpreta a expressão "estado inicial permitido" da **US 9.1 cenário 2** — de "todo o acervo visível" para "nada até o usuário buscar". O PRD é ambíguo nesse ponto e **não muda**; a decisão fica registrada em `design.md`, no mesmo espírito com que o change `gestao-de-unidades` documentou a inversão da "Opção A" de `web-pessoas`.

## Out of Scope (mudança futura)

- **Paginação / limite de resultados** na busca: continua sem paginação, como hoje. Deixar de listar tudo ao carregar reduz o problema, mas uma busca ampla ainda pode retornar muitos itens.
- **Filtro de autor para colaborador**: segue como lacuna conhecida da spec `web-busca` (depende de um endpoint de pessoas seguro-para-colaborador, que não existe). O seletor de autor continua exclusivo de administrador.
- **Carregamento tardio (`onFocus`) da lista de pessoas** que popula o filtro de autor: `GET /users` continua sendo chamado ao abrir a página para administradores — é um controle a popular, não conteúdo de arquivo.
- **Persistir os critérios de busca na URL** (query string) para compartilhar/retomar uma busca.
