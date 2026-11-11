# Tasks

> Fatia com backend, mas **sem** migration, rota nova, prefixo de topo,
> variável de ambiente ou recurso de nuvem: não há tarefa de Terraform, de
> `API_PREFIXES`/proxy nem de SessionStart hook. O índice
> `files (unit_id, folder_id)` já existe (migration 0004).

## 1. Contrato compartilhado

- [ ] 1.1 Em `packages/shared/src/folders.ts`, criar `FolderListItemResponse`
      (`FolderResponse` + `documentCount: number`, obrigatório) e trocar o tipo
      de `FolderContentsResponse.folders` para ele; `FolderResponse` não muda
      (design.md D3). Recompilar `packages/shared`. Verificar:
      `npm run build` passa em todos os workspaces.

## 2. API — contagem filtrada pelo acesso

- [ ] 2.1 Em `apps/api/src/routes/folders.ts::listContents`, depois das
      subpastas, uma consulta `SELECT folder_id, count(*)::int … GROUP BY
      folder_id` com **os mesmos** `visibleResourceClause(FILE)`,
      `nonObsoleteClause` e `visibleRegistrationClause` e o mesmo placeholder
      do dono, restrita por `folder_id = ANY($k)` aos ids recém-listados; não
      roda com lista vazia; pasta ausente do resultado → `0` (design.md D1).
      Comentário citando US 11.1 cenário 3 e design.md D1/D2.
- [ ] 2.2 `toFolderListItemResponse` (ou `toFolderResponse` + contagem) nas
      duas rotas de conteúdo; trilha e pasta corrente continuam
      `FolderResponse`. Verificar: `folders.test.ts` afirma `documentCount`
      presente em cada subpasta da raiz e de `/folders/:id/contents`.

## 3. Testes de não vazamento (design.md D4)

- [ ] 3.1 `folders.test.ts`: igualdade `documentCount(X) ===
      GET /folders/X/contents → files.length` para dono, admin da unidade e
      colaborador com concessões parciais; pasta só com subpastas → `0`.
- [ ] 3.2 Sem herança e por item: `view` só na pasta → `0`; `view` em 1 de 3
      arquivos → `1`. Arquivo na lixeira não conta (inclusive para admin).
- [ ] 3.3 Obsoleto e pendente de cadastro: admin conta os dois; quem enviou o
      pendente o conta; terceiro com `view` não conta nenhum.
- [ ] 3.4 Em `expiracao-permissoes-acesso.test.ts`: concessão de `view` no
      arquivo com `expires_at` no passado → `0` na requisição seguinte, sem job.
- [ ] 3.5 Em `isolamento-unidade.test.ts`: `global_admin` conta só a própria
      unidade (arquivo de outra unidade nunca soma) e pasta de outra unidade
      não aparece. Verificar: `npm run test --workspace apps/api` verde contra o
      Postgres com papel não-superuser.

## 4. Web — cartão de pasta

- [ ] 4.1 Função pura `textoDaContagemDeDocumentos(n)` ("Nenhum documento",
      "1 documento", "N documentos" com milhar `pt-BR`) e `tomDaPasta(id)`
      (estável por id sobre `tonsDeAtalho`), com teste unitário (design.md D5).
- [ ] 4.2 `InicioPage.tsx`: cartão com ícone em quadrado tingido 40×40 à
      esquerda, nome em negrito `azulLink`, contagem em secundário embaixo;
      `aria-label` = nome da pasta e `aria-describedby` → contagem; ícone
      `aria-hidden`.
- [ ] 4.3 `tela-inicial.test.tsx`: ajudante `pasta()` com `documentCount`;
      afirmar "12 documentos", "1 documento", "Nenhum documento", nome
      acessível do link = nome da pasta e descrição com a contagem; o cartão
      continua abrindo a pasta. Verificar: `npm run test --workspace apps/web`.
- [ ] 4.4 Conferir na app (Playwright, 1366×768, seed) o cartão com contagem e
      ícone colorido, e que a contagem bate com a pasta aberta.

## 5. Documentação e fechamento

- [ ] 5.1 `docs/manual/docs/a-tela.md` (Pastas da unidade): o cartão mostra
      quantos documentos você encontra ao abrir a pasta — só os que você pode
      ver, sem contar subpastas.
- [ ] 5.2 `docs/plano_demanda_cliente_3.md`: fatia C → `entregue` com o change
      arquivado; registrar a pendência de validar com o cliente a contagem
      direta × subárvore (design.md D2).
- [ ] 5.3 `npm run lint`, `npm run build`, `npm run test` e
      `npm run format:check` verdes.
