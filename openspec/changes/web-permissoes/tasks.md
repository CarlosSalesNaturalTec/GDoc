## 1. Camada de dados (schemas + queries)

- [ ] 1.1 Adicionar `grantResponseSchema` e `grantListResponseSchema` em
  `apps/web/src/lib/schemas.ts` como `z.ZodType<GrantResponse>`/
  `<GrantListResponse>` de `@gdoc/shared`, validando a fronteira (D6).
- [ ] 1.2 Importar diretamente de `busca/queries.ts` o hook de lista de pessoas
  admin-only (`GET /users`, mapa id→nome) e seu schema, reusando-os como estão
  — sem mover nem criar módulo comum, sem mudar comportamento (D2/D4).
- [ ] 1.3 Criar `apps/web/src/permissoes/queries.ts` com
  `useGrants(resourceType, resourceId)` (query keyed no recurso, montando
  `GET /grants?resourceType=&resourceId=`) e as mutations `useCreateGrant`
  (`POST /grants`) e `useRevokeGrant` (`DELETE /grants/:id`), ambas invalidando
  a query do recurso no sucesso (D3/D4).

## 2. Diálogo de gestão (PermissoesModal)

- [ ] 2.1 Criar `apps/web/src/permissoes/PermissoesModal.tsx` recebendo
  `{resourceType, resourceId, resourceName, open, onClose}`.
- [ ] 2.2 Formulário de concessão: `Select` de pessoa (hook admin-only) +
  `Checkbox.Group` dos verbos `Permission` com rótulos pt-BR; confirmar envia
  **uma** `useCreateGrant` com o array de verbos marcados (D3).
- [ ] 2.3 Lista de vigentes: consumir `useGrants`, agrupar por pessoa (nome via
  mapa de `GET /users`, fallback ao UUID), cada verbo com botão "Revogar"
  (`useRevokeGrant` + `Popconfirm`); estado vazio quando não há concessões (D4).
- [ ] 2.4 Aviso de não-herança (Alert) exibido só quando
  `resourceType === 'folder'` (D5).
- [ ] 2.5 Tratamento de erro: 403/404 e falhas de mutation exibem mensagem
  neutra (`message`/`notification`), sem distinguir inexistência de
  outra-unidade; falha de `GET /users` degrada suave (vigentes por UUID,
  concessão indisponível com aviso) (D4, Risks).

## 3. Integração no explorador

- [ ] 3.1 Adicionar a ação "Permissões" (ícone de cadeado) na coluna de ações do
  `apps/web/src/navegacao/ExplorerPage.tsx`, para linha de pasta e de arquivo,
  abrindo o `PermissoesModal` com o recurso da linha.
- [ ] 3.2 Condicionar a ação a `useSession().role ∈ {unit_admin, global_admin}`
  — não renderizar para colaborador (D1/D2).

## 4. Testes (Vitest + Testing Library)

- [ ] 4.1 A ação "Permissões" aparece para admin e **não** aparece para
  colaborador (cenários de guarda).
- [ ] 4.2 Conceder só `view` envia `POST /grants` com `permissions:['view']` e
  os vigentes recarregam mostrando só `view`.
- [ ] 4.3 Conceder múltiplos verbos envia o conjunto numa única chamada;
  reconceder um verbo existente não quebra (idempotência) nem duplica na lista.
- [ ] 4.4 Revogar um verbo chama `DELETE /grants/:id` e remove só aquele verbo,
  preservando os demais; recurso sem concessões mostra estado vazio.
- [ ] 4.5 O aviso de não-herança está visível ao abrir o modal de uma pasta e
  ausente para arquivo.

## 5. Fechamento

- [ ] 5.1 `npm run lint`, `npm run build` e `npm run test --workspace apps/web`
  verdes.
- [ ] 5.2 Marcar a Fatia 6 como proposta/entregue em
  `docs/frontend_roadmap.md`, registrando as lacunas de expiração e
  multi-seleção.
