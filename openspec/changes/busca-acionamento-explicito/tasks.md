## 1. Consulta sob demanda (`apps/web/src/busca/queries.ts`)

- [ ] 1.1 Fazer `useSearchFiles` aceitar o critério **submetido** como `SearchFilesQuery | undefined` e repassar `enabled: params !== undefined` ao `useQuery`, de modo que `undefined` (nada submetido) não dispare requisição alguma (design.md D1).
- [ ] 1.2 Atualizar o comentário de cabeçalho de `useSearchFiles`, que hoje afirma que o estado inicial vazio é "uma busca sem parâmetros — o estado inicial permitido (US 9.1 cenário 2)"; passar a citar design.md D1/D3 e a nova leitura de "estado inicial permitido".
- [ ] 1.3 Não alterar `toQueryString`, `useAuthorOptions` nem qualquer contrato de `GET /files/search`.

## 2. Estado dos controles vs. critério submetido (`apps/web/src/busca/BuscaPage.tsx`)

- [ ] 2.1 Separar os dois estados: manter `filters` como valor dos controles e introduzir `submitted: SearchFilesQuery | undefined` (inicialmente `undefined`), passando apenas `submitted` para `useSearchFiles` — removendo o `useMemo` que derivava a query direto de `filters` (design.md D1).
- [ ] 2.2 Implementar o predicado de **critério ativo**: `q.trim()` não vazio **ou** `type` **ou** `author` **ou** `dateRange` definidos; um único caractere no nome já conta (design.md D2).
- [ ] 2.3 Criar a função de submissão (`toSearchQuery(filters)` → `setSubmitted`) usada tanto pelo botão quanto pelo Enter, que não faz nada quando não há critério ativo.

## 3. Barra de filtros: botão "Buscar" e limpar (`apps/web/src/busca/BuscaPage.tsx`)

- [ ] 3.1 Adicionar o botão **"Buscar"** (`type="primary"`, ícone de lupa) na barra de filtros, `disabled` quando não houver critério ativo, chamando a função de submissão.
- [ ] 3.2 Ligar `onSearch` do `Input.Search` já existente à mesma função de submissão, dando o atalho de Enter sem componente novo (design.md D6).
- [ ] 3.3 Alterar "Limpar filtros" para zerar **os dois** estados (`filters = EMPTY_FILTERS` e `submitted = undefined`), sem disparar consulta — voltando ao estado inicial (design.md D3).

## 4. Estados de tela (`apps/web/src/busca/BuscaPage.tsx`)

- [ ] 4.1 Renderizar o **estado inicial** quando `submitted === undefined` — mensagem instruindo a informar ao menos um critério para buscar — **fora** da `Table`, que nem chega a ser montada (design.md D5).
- [ ] 4.2 Garantir que a mensagem do estado inicial seja textualmente distinta de "Nenhum resultado" (`locale.emptyText` da `Table`), preservando a exclusão mútua entre os dois estados.
- [ ] 4.3 Manter inalterados os estados de carregando (`Spin`) e de erro (`Result`), verificando que nenhum deles aparece antes da primeira submissão.

## 5. Testes de web (`apps/web/src/__tests__/busca.test.tsx`)

- [ ] 5.1 Adicionar teste: abrir `/busca` **não** chama `GET /files/search` e exibe o estado inicial (spec `web-busca`, cenário "Abrir a página não consulta o servidor").
- [ ] 5.2 Adicionar teste: sem nenhum critério, o botão "Buscar" está desabilitado e o Enter no campo de nome não dispara consulta.
- [ ] 5.3 Adicionar teste: um único caractere no nome habilita o botão e o acionamento consulta o servidor.
- [ ] 5.4 Adicionar teste: alterar um filtro após uma busca mantém os resultados anteriores e não dispara nova consulta.
- [ ] 5.5 Reescrever `busca com filtros combinados...` (linha 33) para acionar a busca explicitamente antes de esperar os resultados, em vez de contar com o carregamento automático.
- [ ] 5.6 Reescrever `limpar filtros reseta os controles e refaz a busca sem critérios` (linha 51) para a nova regra: limpar zera os controles, remove os resultados e **não** chama `GET /files/search` — invertendo a asserção atual que exige a chamada sem critérios.
- [ ] 5.7 Ajustar os testes de filtro de autor (linhas 73 e 99), de preview/download (linha 112) e de resultado vazio (linha 140), todos hoje dependentes do carregamento automático, para acionarem a busca antes de esperar a lista; no teste do colaborador, manter a asserção de que `GET /users` não é chamado.
- [ ] 5.8 Rodar `npm run test --workspace apps/web -- src/__tests__/busca.test.tsx` e confirmar a suíte verde.

## 6. Verificação final

- [ ] 6.1 Rodar `npm run lint` e `npm run build` na raiz.
- [ ] 6.2 Rodar `npm run test` na raiz e confirmar que as suítes de **api** seguem intactas (nenhuma mudança de backend foi feita).
- [ ] 6.3 Subir a app em dev (`make dev-api` + `npm run dev:web`) e conferir manualmente na tela: abrir `/busca` sem requisição no painel de rede, botão desabilitado, Enter buscando, limpar voltando ao estado inicial.
- [ ] 6.4 Rodar `openspec validate busca-acionamento-explicito --strict`.
