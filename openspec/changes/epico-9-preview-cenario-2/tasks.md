## 1. Contratos compartilhados (`packages/shared`)

- [ ] 1.1 Adicionar em `packages/shared/src/dashboard.ts` (ou módulo de tipos
  adequado) o predicado `isPreviewable(contentType: string | null): boolean`
  derivado de `fileCategory` — pré-visualizáveis: `pdf`, `image`, `video`,
  `audio`, `text`; não pré-visualizáveis: `office`, `other` — com comentário
  documentando que `office` migra para pré-visualizável quando a conversão do
  cenário 1 (fase futura) existir
- [ ] 1.2 Em `packages/shared/src/storage.ts`, definir a união discriminada
  `ViewUrlResponse`: ramo `{ previewAvailable: true; url; expiresAt; action }`
  (superset do `SignedUrlResponse`) e ramo `{ previewAvailable: false;
  reason: 'unsupported_format'; download: { available: boolean } }`; exportar
  pelo `index.ts`
- [ ] 1.3 `npm run build --workspace packages/shared` para atualizar o `dist`
  consumido por `apps/api`

## 2. Rota de visualização (`apps/api`)

- [ ] 2.1 Em `apps/api/src/routes/files.ts`, no handler
  `POST /files/:id/view-url`, manter a checagem `view` fail-closed no início e,
  após ela, ramificar por `isPreviewable(file.content_type)`
- [ ] 2.2 Ramo pré-visualizável: preservar o comportamento atual —
  `recordAudit(..., VIEW)` + `getViewUrl` — e responder com
  `previewAvailable: true`
- [ ] 2.3 Ramo não pré-visualizável: **não** auditar e **não** assinar URL;
  resolver a permissão `download` via
  `findAccessibleFile(ports, ctx, id, Permission.DOWNLOAD)` para preencher
  `download.available`; responder `previewAvailable: false` com
  `reason: 'unsupported_format'`

## 3. Testes (`apps/api/src/__tests__`)

- [ ] 3.1 Formato pré-visualizável (ex.: `application/pdf`, `image/png`): resposta
  `previewAvailable: true` com URL e ação `view`, e **uma** linha de auditoria
  `view` gravada (padrão `seedTwoUnits` / `withSystemBypass`)
- [ ] 3.2 Formato Office (ex.: `.docx`) com solicitante detentor de `download`:
  `previewAvailable: false`, sem URL, **nenhuma** auditoria `view`, e
  `download.available === true`
- [ ] 3.3 Formato não pré-visualizável com solicitante que só tem `view` (sem
  `download`): `previewAvailable: false` e `download.available === false`
- [ ] 3.4 `content_type` ausente/desconhecido: cai no ramo `previewAvailable:
  false` (nunca URL `inline`)
- [ ] 3.5 Sem o verbo `view` (arquivo de outra unidade, item na lixeira, link
  direto sem permissão): 403 fail-closed antes de qualquer classificação de
  formato, sem URL, sem auditoria e sem vazar existência/formato

## 4. Verificação e fechamento

- [ ] 4.1 `npm run lint`, `npm run build` e `npm run test --workspace apps/api`
  passando
- [ ] 4.2 `openspec verify --change epico-9-preview-cenario-2` (specs coerentes
  com a implementação) antes de arquivar
