## Context

`BuscaPage` mantém um único estado, `filters`, que é ao mesmo tempo **o valor dos controles** e **o critério consultado**: `query` é derivada dele por `useMemo` e vira `queryKey` de `useSearchFiles` (`apps/web/src/busca/BuscaPage.tsx:62-65`). Como o TanStack Query busca por padrão assim que a chave existe, isso produz dois efeitos indesejados:

1. no primeiro render, `filters` está vazio ⇒ sai um `GET /files/search` **sem parâmetro algum** ⇒ o servidor devolve todo o acervo visível ao usuário;
2. cada tecla no campo de nome muda a `queryKey` ⇒ **uma requisição por caractere**, sem debounce.

O servidor está correto e não é o problema: `GET /files/search` sem filtros retornar tudo o que o solicitante pode ver é a semântica esperada do endpoint, coberta pela spec `busca` e pelos testes de backend, e é a mesma fronteira de visibilidade da navegação (dono OU grant `view` OU admin da unidade), com RLS por `unit_id` por baixo. Nada disso muda aqui.

Restrição de contrato: a spec `web-busca` hoje **exige** o comportamento que estamos removendo — *"a SPA SHALL refazer a busca sem critério algum, retornando ao estado inicial permitido — a lista de todos os arquivos visíveis"*. Esta change reinterpreta essa expressão e precisa dizê-lo explicitamente.

## Goals / Non-Goals

**Goals:**

- Nenhuma requisição a `GET /files/search` ao abrir `/busca`.
- Consulta acionada apenas por gesto explícito do usuário (botão "Buscar" ou Enter no campo de nome).
- Impossibilitar, pela tela de busca, a listagem do acervo inteiro sem critério.
- Distinguir visualmente "ainda não busquei" de "busquei e não achei".
- Eliminar a rajada de requisições por tecla digitada, como consequência do acionamento explícito.

**Non-Goals:**

- Alterar `GET /files/search`, `lib/search-filters.ts` ou qualquer regra de visibilidade/isolamento no servidor.
- Introduzir debounce, mínimo de caracteres, paginação ou limite de resultados.
- Persistir critérios de busca na URL.
- Mudar o filtro de autor (segue exclusivo de administrador) ou o momento em que `GET /users` popula esse seletor.

## Decisions

### D1 — Separar "estado dos controles" de "critério submetido"

Dois estados em vez de um:

```
   ┌─────────────┐  digita / seleciona   ┌──────────────┐
   │  controles  │ ────────────────────▶ │   filters    │  (local; NÃO consulta)
   └─────────────┘                       └──────┬───────┘
                                                │ "Buscar" / Enter
                                                ▼
                                         ┌──────────────┐
                                         │  submitted   │ ──▶ queryKey de useSearchFiles
                                         └──────────────┘
```

`submitted` começa `undefined` — e `undefined` é o **único** sinal de "nada foi consultado ainda". `useSearchFiles` ganha `enabled: submitted !== undefined`, então no primeiro render nenhuma requisição sai.

*Alternativa considerada:* manter um único estado e apenas condicionar `enabled` a "há algum critério ativo". Rejeitada porque não distingue "o usuário limpou os filtros" de "o usuário nunca buscou", e faria a lista mudar sozinha ao mexer nos controles — exatamente o acoplamento que estamos removendo (ver D4).

### D2 — "Critério ativo" e o botão desabilitado

Um critério é ativo quando: `q.trim()` não é vazio **OU** `type` definido **OU** `author` definido **OU** `dateRange` definido. Sem nenhum deles, o botão "Buscar" fica **desabilitado** e o Enter no campo de nome não faz nada.

**Um caractere já conta.** Não há mínimo de caracteres: com acionamento explícito não existe rajada por tecla a evitar, e exigir 2–3 caracteres seria só atrito para quem procura por um nome curto.

Consequência deliberada: pela tela de busca **não há como listar o acervo inteiro**. Quem quer ver tudo usa a navegação por pastas, que é a superfície projetada para isso.

*Alternativa considerada:* botão sempre habilitado, com busca vazia permitida como escolha deliberada do usuário. Rejeitada — mantém o despejo do acervo a um clique de distância, contrariando a intenção da change.

### D3 — "Limpar filtros" volta ao estado inicial, sem consultar

Limpar zera **os dois** estados de D1: `filters = EMPTY_FILTERS` e `submitted = undefined`. A tela retorna ao estado inicial e **nenhuma requisição é feita**.

Isto é a **reinterpretação da US 9.1 cenário 2** ("*todos os filtros são removidos e a lista volta ao estado inicial permitido*"). O PRD não define o que é "estado inicial permitido"; a leitura vigente ("todo o acervo visível") vira "nada exibido até uma nova busca". **O PRD não muda** — muda a spec `web-busca`, com delta explícito, no mesmo espírito com que o change `gestao-de-unidades` (D7) inverteu a "Opção A" de `web-pessoas`. Registrado aqui para que uma revisão futura não trate a divergência como regressão.

### D4 — Filtros alterados após uma busca mantêm a lista, sem aviso

Mexer nos controles muda só `filters`; `submitted` permanece, então os resultados anteriores continuam na tela até um novo acionamento. Sem badge de "desatualizado".

*Alternativas consideradas:* (a) esvaziar a lista a cada alteração — a tela pisca para vazio enquanto o usuário ajusta um filtro, perdendo o que estava lendo; (b) indicar "filtros alterados, busque novamente" — mais código e mais ruído visual do que o problema justifica nesta fatia. Trade-off assumido em Risks.

### D5 — Três estados de tela mutuamente exclusivos

```
   INICIAL              SEM RESULTADO            RESULTADOS
   submitted undefined  submitted + files=[]     submitted + files>0
   ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
   │ 🔍 Informe um    │ │ ∅ Nenhum         │ │ [tabela]         │
   │   critério para  │ │   resultado para │ │                  │
   │   buscar         │ │   estes filtros  │ │                  │
   └──────────────────┘ └──────────────────┘ └──────────────────┘
```

Os estados de **carregando** (`Spin`) e **erro** (`Result`) permanecem como estão. O texto do estado inicial **não** pode reusar a mensagem "Nenhum resultado": confundir os dois é o modo de falha clássico dessa mudança — o usuário conclui que não tem arquivo nenhum. Como o `Empty` de "nenhum resultado" vive em `locale.emptyText` da `Table`, o estado inicial é renderizado **fora** da `Table` (a tabela nem é montada), o que garante a exclusão mútua por construção.

### D6 — Enter reusa o `Input.Search` existente

O campo de nome já é um `Input.Search`, que expõe `onSearch` (Enter e clique na lupa). Ligar `onSearch` à mesma função do botão "Buscar" dá o atalho de teclado sem componente novo — respeitando D2 (não submete se não houver critério ativo).

## Risks / Trade-offs

- **[Reescreve o comportamento de uma spec arquivada (`web-busca`)]** → Delta spec explícito marcando o requisito de "limpar filtros" como MODIFIED, com a reinterpretação da US 9.1 cenário 2 registrada em D3. Testes de web da busca atualizados junto, para que a spec e o teste digam a mesma coisa.
- **[Um usuário acostumado à lista automática pode achar que a busca "quebrou"]** → O estado inicial é textual e imperativo ("Informe um critério para buscar"), não um vazio mudo; o botão desabilitado sinaliza o que falta.
- **[Sem aviso de "filtros alterados" (D4), a lista exibida pode não corresponder aos controles]** → Aceito conscientemente: a alternativa (piscar para vazio) é pior no uso real. Se virar reclamação, um badge no botão "Buscar" é aditivo e não conflita com esta spec.
- **[`GET /users` continua sendo chamado ao abrir a página para administradores]** → Fora de escopo por decisão: é a lista que popula o seletor de autor (um controle), não conteúdo de arquivo; não expõe bytes nem contraria o pedido.
- **[Divergência de leitura entre a spec de backend (`busca`) e a de frontend (`web-busca`)]** → O endpoint continua retornando tudo para uma busca sem filtros. Só o **nome** do cenário em `busca` é ajustado para deixar de se apresentar como o comportamento da tela; o comportamento e os testes de backend ficam intactos.

## Migration Plan

Mudança puramente de frontend, sem migration de banco, sem alteração de contrato de API e sem novo prefixo de rota (nada a sincronizar entre `api-prefixes.ts`, `vite.config.ts` e `locals.tf`). Deploy padrão da SPA; rollback é reverter o commit. Não há janela de versões mistas problemática: uma SPA antiga contra a API nova (ou vice-versa) funciona igual, porque o endpoint não mudou.

## Open Questions

Nenhuma bloqueante.
