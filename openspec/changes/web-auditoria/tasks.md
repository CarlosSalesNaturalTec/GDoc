## 1. Camada de dados (schema + hook)

- [ ] 1.1 `apps/web/src/lib/schemas.ts`: adicionar `auditQueryResponseSchema`
  tipado como `z.ZodType<AuditQueryResponse>` contra `@gdoc/shared` —
  `events[]` com `actor { id, name: string().nullable(), email }`, `action`
  como `z.enum(['view','download'])` e `createdAt` string — design.md D6
- [ ] 1.2 `apps/web/src/auditoria/queries.ts`: hook `useFileAudit(fileId, open)`
  como `useQuery`, `queryKey` `['file-audit', fileId]`, `enabled: open &&
  !!fileId`, chamando `GET /files/:id/audit` via `apiClient` e fazendo `.parse()`
  da resposta — design.md D3

## 2. Modal de auditoria (`AuditoriaModal`)

- [ ] 2.1 `apps/web/src/auditoria/AuditoriaModal.tsx`: `Modal` (título "Auditoria
  — {nome do arquivo}", `destroyOnClose`) que recebe o arquivo em auditoria e
  usa `useFileAudit(file.id, open)`; `Spin` em carregamento — design.md D2
- [ ] 2.2 `Table` de eventos com colunas **Pessoa · Ação · Data/hora**: Pessoa =
  `actor.name ?? actor.email`; Ação = `Tag` pt-BR por mapa `Record<'view'|
  'download', string>` (`view`→"Visualizar", `download`→"Baixar"); Data/hora =
  `formatDate(createdAt)` de `navegacao/format.ts`; ordem preservada do servidor —
  spec: registro consultável / ação como rótulo pt-BR / ator sem nome cai no
  e-mail; design.md D4
- [ ] 2.3 `Empty` "Nenhum acesso registrado" quando `events` é vazio (não é
  erro) — spec: arquivo sem acessos exibe estado vazio; design.md D5
- [ ] 2.4 403 na consulta: `Result` de permissão insuficiente neutro via
  `handlePermissionError` (`ApiError` status 403), sem distinguir subcasos nem
  expor conteúdo — spec: consulta negada exibe aviso neutro; design.md D5

## 3. Ação "Auditoria" no explorador

- [ ] 3.1 `apps/web/src/navegacao/ExplorerPage.tsx`: estado `auditingFile`
  (`FileSummaryResponse | null`) e renderização do `<AuditoriaModal>` controlada
  por ele, espelhando `previewingFile`/`managingResource` — design.md D2
- [ ] 3.2 Ação **"Auditoria"** só na linha de **arquivo** (nunca pasta), visível
  quando `isAdmin || row.file.ownerId === identity?.id` (Opção A), usando o
  `identity` já disponível via `useSession` — spec: administrador vê / dono vê /
  colaborador não vê em arquivo alheio / pasta não tem ação; design.md D1

## 4. Testes (Vitest + Testing Library)

- [ ] 4.1 `apps/web/src/__tests__/auditoria.test.tsx`: reusar `renderApp` +
  `mock-fetch`; abrir a auditoria de um arquivo chama `GET /files/:id/audit` e
  exibe cada acesso com pessoa, ação (Tag) e data/hora na ordem do servidor —
  spec: registro consultável (US 7.1)
- [ ] 4.2 Ação `view` renderiza "Visualizar" e `download` renderiza "Baixar"; um
  evento com `actor.name` nulo exibe o `actor.email` — spec: ação como rótulo
  pt-BR / ator sem nome cai no e-mail
- [ ] 4.3 Arquivo sem acessos (lista vazia) exibe `Empty` "nenhum acesso
  registrado" sem erro; 403 exibe aviso neutro de permissão insuficiente — spec:
  estado vazio / consulta negada
- [ ] 4.4 Visibilidade (Opção A): administrador e dono veem a ação "Auditoria";
  colaborador não-dono **não** vê a ação em arquivo alheio; pasta não tem a
  ação — spec: administrador vê / dono vê (US 7.2) / colaborador não vê / pasta
  não tem ação

## 5. Verificação e documentação

- [ ] 5.1 `npm run lint`, `npm run build` e `npm run test --workspace apps/web`
  passando (a fatia não toca `apps/api`/`packages/shared`)
- [ ] 5.2 `docs/frontend_roadmap.md`: marcar a **Fatia 8** como entregue (✅) e
  registrar as lacunas conhecidas (sem filtro/paginação server-side e teto de
  500, só `view`/`download`, sem exportação, sem auditoria a partir da
  busca/preview)
