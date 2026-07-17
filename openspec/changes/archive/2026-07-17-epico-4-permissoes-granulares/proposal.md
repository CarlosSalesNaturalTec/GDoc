# Proposal — epico-4-permissoes-granulares

## Why

Governança de acesso é o núcleo de valor do GDoc, mas hoje o controle de acesso
a conteúdo pára na **unidade + posse**: a RLS isola unidades e as rotas checam
`owner_id = ctx.userId`. Isso deixa dois furos frente ao PRD (`docs/prd_final.md`):

1. **Não existe compartilhamento.** Uma pessoa só acessa o que ela mesma criou.
   O PRD (Épico 4, US 4.1) exige conceder permissões específicas — visualizar,
   baixar, enviar, renomear/substituir, excluir — sobre uma pasta ou sobre
   arquivos selecionados, "na medida exata".
2. **`view-url`/`download-url` vazam dentro da unidade.** `findFileById` restringe
   só pela RLS (unidade), **não** pela posse — então qualquer pessoa da mesma
   unidade consegue emitir URL assinada (e gerar auditoria de acesso) para
   **qualquer** arquivo da unidade, mesmo sem nenhuma permissão sobre ele. O
   requisito não funcional de confidencialidade e a US 4.2 ("link direto sem
   permissão é bloqueado, sem preview") exigem o contrário.

Esta mudança entrega a **Fatia A do Épico 4**: o motor de permissão granular
**por pessoa** (`grants`) e a sua imposição em toda a aplicação. É a peça-chave
de que dependem o download compactado de pasta (US 3.3, adiada no Épico 3), a
visibilidade "itens que me foram liberados" (US 2.1, cenário 2, hoje cumprida só
como "itens que criei"), o alcance administrativo do Épico 5 e os filtros do
Épico 9.

## What Changes

- **Modelo de concessão por pessoa** (US 4.1): nova tabela `grants` — uma linha
  por `(pessoa destinatária, recurso, verbo)`, onde recurso é uma **pasta** ou um
  **arquivo** e verbo é um de `view` / `download` / `upload` / `rename` /
  `delete`. Tenant-scoped: coluna `unit_id` + policy RLS, como toda tabela de
  unidade. Migração aditiva `0007`.
- **Sem herança para o conteúdo interno** (US 4.1, cenário 2): conceder sobre uma
  pasta libera **a pasta** (navegar/abrir), mas **não** cascateia para os arquivos
  e subpastas dentro dela — cada item interno só fica acessível com um grant
  próprio. A resolução de acesso nunca deriva permissão de um ancestral.
- **Endpoints de gestão de permissão** (US 4.1), restritos a administrador
  (`unit_admin`/`global_admin`, mesmo padrão de `routes/users.ts`):
  - `POST /grants` — concede um ou mais verbos a uma pessoa sobre um recurso, de
    forma idempotente (reconceder não duplica).
  - `GET /grants?resourceType=&resourceId=` — lista quem tem o quê sobre um
    recurso, para a administração gerir.
  - `DELETE /grants/:id` — revoga uma concessão.
- **Imposição da permissão em toda a aplicação** (US 4.2 e FR #10): a checagem
  deixa de ser "é dono?" e passa a ser "**é dono OU tem grant do verbo exigido?**",
  fail-closed (403, sem URL e sem auditoria quando negado):
  - `POST /files/:id/view-url` → exige `view`; `…/download-url` → exige `download`.
  - `PATCH /files/:id` e `POST /files/:id/replace-url` → exigem `rename`.
  - `POST /files/upload-url` e `.../upload-urls` para dentro de uma pasta de
    **outra pessoa** → exigem `upload` sobre a pasta de destino.
  - `GET /folders/:id/contents` → exige `view` sobre a pasta; a listagem
    (raiz inclusive) passa a devolver **itens que criei OU que me foram
    liberados** (`view`), fechando a US 2.1, cenário 2.
- **DTOs compartilhados** (`packages/shared`): novo módulo `permissions` com o
  enum de verbos, o tipo de recurso e os contratos de request/response dos
  endpoints de grant.

Fora de escopo (fatias futuras, registradas em design.md):

- **Concessão a GRUPO** — a US 4.1 menciona "pessoa ou grupo", mas não existe
  conceito de grupo no schema nem no restante do PRD. `grants` nasce por pessoa;
  grupo (principal = grupo + tabela de membros) é fatia posterior.
- **US 4.3 (expiração de permissão)** — `expires_at`, aviso prévio e corte
  automático dependem de uma rotina agendada (mesma família da rotina 03:00 da
  Lixeira, Épico 6); vira Fatia B.
- **Alcance administrativo amplo sobre conteúdo de terceiros** (ver tudo da
  unidade sem grant) — é o **Épico 5**; aqui o admin **concede** permissão, mas o
  acesso a conteúdo continua por dono-ou-grant para todos os papéis.
- **US 3.3 (download ZIP de pasta filtrado por permissão)** — passa a ser
  destravável, mas o motor de compactação em si permanece fora desta fatia.

## Capabilities

### New Capabilities

- `permissoes-granulares`: modelo de concessão de permissões **por pessoa** sobre
  pasta ou arquivo, cobrindo os cinco verbos (visualizar, baixar, enviar,
  renomear/substituir, excluir), **sem herança** para o conteúdo interno de
  pastas, com endpoints administrativos de conceder/listar/revogar. Cobre US 4.1.

- `controle-acesso`: imposição da permissão no servidor a cada ação — dono-ou-grant
  fail-closed em visualizar, baixar, renomear/substituir e enviar; bloqueio de
  acesso por link direto a arquivo sem permissão (403, sem preview e sem
  auditoria); e listagem de pasta restrita a itens próprios ou liberados. Cobre
  US 4.2 e completa a US 2.1, cenário 2.

### Modified Capabilities

<!-- Nenhum requisito verificável já publicado é reescrito. As capabilities
     `navegacao` (Épico 2) e `envio-lote`/`envio-pasta` (Épico 3) continuam
     válidas; esta mudança adiciona uma camada de autorização por cima delas —
     a listagem de conteúdo ganha a dimensão "liberado a mim", e os endpoints de
     URL assinada passam a exigir o verbo correspondente. O mecanismo de tenancy
     (SET LOCAL por transação, RLS por unit_id) e o fluxo de URL assinada de TTL
     curto permanecem intactos. A US 2.1 cenário 2 já previa "itens que me foram
     liberados"; ela só era cumprida parcialmente por ausência do motor de grants,
     agora entregue. -->

## Impact

- **Banco (`apps/api/src/db/migrations`):** nova migração `0007_grants.sql` —
  tabela `grants` (`unit_id`, `subject_user_id`, `resource_type`, `resource_id`,
  `permission`, `granted_by`, `created_at`), índice único por
  `(unit_id, subject_user_id, resource_type, resource_id, permission)`, índice de
  lookup por `(subject_user_id, resource_type, permission)`, e RLS
  enable/force + policy `unit_isolation` no mesmo formato de `0002`.
- **API (`apps/api/src`):** novo `routes/grants.ts` (conceder/listar/revogar,
  admin-only); novo helper de resolução de acesso (`lib/access.ts`) com
  `hasGrant`/`assertAccess`, reutilizado por `routes/files.ts` e
  `routes/folders.ts`; substituição das checagens `owner_id === ctx.userId` por
  dono-ou-grant em view-url, download-url, rename, replace-url e upload em pasta
  alheia; listagem de conteúdo (raiz e por pasta) passa a incluir itens liberados.
  Registro do novo router em `app.ts`.
- **Shared (`packages/shared/src`):** novo `permissions.ts` (enum de verbos, tipo
  de recurso, DTOs de grant) exportado no `index.ts`; rebuild de `dist`.
- **Testes (`apps/api/src/__tests__`):** `grants.test.ts` (CRUD admin-only + RLS
  de isolamento de grants entre unidades) e extensão de `permission.test.ts`
  (não-dono da mesma unidade bloqueado sem grant; liberado acessa e é auditado;
  ausência de herança pasta→conteúdo; listagem com itens próprios + liberados;
  rename/replace e upload em pasta alheia exigindo verbo).
- **Sem mudança de infra/GCP** e **sem paridade de sandbox nova** — a feature é
  puramente de aplicação + schema; a migração roda pelo mesmo `npm run migrate`.
