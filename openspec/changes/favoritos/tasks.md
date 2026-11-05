# Tasks

## 1. Banco e contrato

- [ ] 1.1 Migração `0021_favorites.sql`: tabela `favorites` com `unit_id`,
  `user_id`, `resource_type`, `resource_id`, `created_at`; `UNIQUE (user_id,
  resource_type, resource_id)`; índice por `(user_id, created_at DESC)`; RLS
  `ENABLE` + `FORCE` + policy `unit_isolation` (design.md D1).
- [ ] 1.2 DTOs em `packages/shared`: item da lista (tipo, id, nome, pasta que o
  contém, verbos, `favoritedAt`, dados de controle do arquivo), resposta da
  marcação; `isFavorite` nos itens da listagem de pasta. Recompilar o shared.
- [ ] 1.3 `config.favorites.maxPerUser` (padrão 200).

## 2. API

- [ ] 2.1 `routes/favorites.ts`: `PUT` (exige `hasAccess(view)`, 404 sem
  alcance, idempotente, 409 `favorites_limit_exceeded` acima do teto),
  `DELETE` (idempotente, sem exigir alcance), `GET` (marca → `hasAccess(view)`,
  omitindo sem apagar; verbos por `hasAccess`; pasta que contém) — design.md
  D2, D3, D4.
- [ ] 2.2 Prefixo `/favorites` nas três listas: `lib/api-prefixes.ts`,
  `apps/web/vite.config.ts`, `infra/terraform/locals.tf`; montar sob
  `attachTenantContext` em `app.ts` (design.md D6).
- [ ] 2.3 `isFavorite` na listagem de pasta (`EXISTS` por linha) — design.md D5.
- [ ] 2.4 Expurgo remove marcas em `jobs/purge-trash.ts` (design.md D7).
- [ ] 2.5 Testes: marcar sem alcance (sem permissão, outra unidade, lixeira) →
  404 indistinguível; idempotência; teto; favorito de outra pessoa não aparece
  (inclusive ao admin); concessão vencida oculta e nova concessão devolve;
  obsoleto oculto ao colaborador; lixeira oculta e restauração devolve; verbos
  devolvidos; localização sem ancestrais; expurgo sem órfãos; RLS isola a
  tabela por unidade; `web-serving` cobre `/favorites`.

## 3. Web

- [ ] 3.1 `favoritos/FavoritosPage.tsx` e consultas, na forma de
  `CompartilhadosPage` (design.md D8); tela vazia orientada.
- [ ] 3.2 Item **Favoritos** no grupo NAVEGAÇÃO, entre Recentes e
  Compartilhados comigo, rota `/favoritos`.
- [ ] 3.3 Ação Favoritar / Remover dos favoritos no explorador, por
  `isFavorite`, invalidando a listagem e a lista de favoritos.
- [ ] 3.4 Testes da página, do menu e da ação no explorador.

## 4. Documentação e fechamento

- [ ] 4.1 Manual: página `colaborador/favoritos.md` (e `mkdocs.yml`), menu em
  `a-tela.md`.
- [ ] 4.2 PRD: retirar favoritos de Fora de Escopo e acrescentar a US 2.5.
- [ ] 4.3 Plano: A4 como entregue, desvios e lacunas.
- [ ] 4.4 `npm run lint`, `build`, `test`, `format:check`; conferir no navegador
  em 1440 e 375 px.
