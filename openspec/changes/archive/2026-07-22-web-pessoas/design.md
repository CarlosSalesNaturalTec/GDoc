## Context

As Fatias 1–8 entregaram a fundação da SPA: o **shell com guarda por papel**
(`RequireAuth roles={[...]}`, design.md D6 da Fatia 1), o `useSession` (identidade
+ papel em `identity`), o `apiClient` same-origin, TanStack Query + Zod na
fronteira, e o padrão de **mutation com invalidação** de `permissoes/queries.ts`.
A rota **`/admin/pessoas` já existe** no router sob `[unit_admin, global_admin]`,
apontando hoje para um `PlaceholderPage`; o item de menu "Pessoas" também já
aparece só para admins. Esta fatia só preenche o conteúdo.

O backend (Épico 1, `apps/api/src/routes/users.ts`, arquivado) é o **único
guardião de permissão** e já expõe tudo que esta fatia precisa — nenhuma mudança
de API:

| Endpoint | Uso | DTO (`@gdoc/shared`) |
|---|---|---|
| `GET /users` | listar pessoas do alcance | `PersonResponse[]` |
| `POST /users` | cadastrar pessoa | `CreatePersonRequest` → `PersonResponse` |
| `PATCH /users/:id` | editar perfil/papel/status | `UpdatePersonRequest` → `PersonResponse` |

Regras de governança já implementadas no servidor, que o cliente **não duplica**,
apenas respeita:

- **Admin-only** (`isAdmin`): `collaborator` recebe 403 nas três rotas — a SPA nem
  o deixa chegar à página (guarda de papel), mas o servidor decide de fato.
- **RLS por `unit_id`**: `unit_admin` só lista/edita pessoas da própria unidade;
  editar pessoa de outra unidade retorna **0 linhas** → o servidor responde **403**
  (mesma indistinção fail-closed de `routes/files.ts`). `global_admin` tem bypass
  para listar todas.
- **Travas de papel**: `unit_admin` **não** pode criar nem elevar ninguém a
  `global_admin` (403); no cadastro, o `unitId` do corpo é **ignorado** para
  `unit_admin` (forçado à própria unidade).
- **E-mail único**: violação de unicidade (`23505`) vira **409 "email already in
  use"**.
- **Senha só no cadastro**: `CreatePersonRequest.password` é obrigatório (400 sem
  ele); `UpdatePersonRequest` **não** tem `password`.
- **Sem exclusão**: não há `DELETE /users`; desativar é `PATCH { status:
  'disabled' }`, que preserva arquivos/auditoria e só bloqueia login
  (`attachTenantContext` relê o status a cada requisição — US 1.2 cenário 3).

**Sem `GET /units`**: unidades nascem só por migration/seed; não há endpoint para
listá-las. Isso condiciona a decisão D2.

## Goals / Non-Goals

**Goals:**
- Cadastrar, listar e editar pessoas pela administração a partir de
  `/admin/pessoas` (US 1.1, RF #1/#2/#3), incluindo ativar/desativar conta.
- Manter o servidor como único guardião: a guarda de papel da rota e as travas de
  UX (esconder `global_admin` para `unit_admin`, esconder auto-rebaixamento) são
  conveniência; o 403/409/RLS do servidor é a rede real.
- Reuso máximo da fundação: `apiClient`, TanStack Query, Zod, `useSession`, o
  padrão de mutation+invalidação de `permissoes/queries.ts`,
  `handlePermissionError`/`message`, `renderApp`/`mock-fetch`.

**Non-Goals:**
- Criação cross-unit pelo `global_admin` (Opção A, D2) — falta `GET /units`.
- Redefinição de senha pela UI — `PATCH /users/:id` não aceita `password`.
- Paginação/filtro server-side — `GET /users` não os expõe; `Table` client-side.
- Coluna de unidade legível — sem `GET /units`, só haveria o UUID cru.
- Exclusão permanente de pessoa — não há `DELETE /users`; só desativação.
- Qualquer mudança em `apps/api` ou `packages/shared` — só consumo.

## Decisions

### D1 — Página com `Table`, não modal aberto do explorador
Diferente das Fatias 6/8 (modais abertos de uma ação de linha do explorador), a
gestão de pessoas é uma **tela própria** já reservada na navegação
(`/admin/pessoas`, item de menu "Pessoas"). Decisão: uma `PessoasPage` que
substitui o `PlaceholderPage`, com uma `Table` de pessoas e um botão "Nova
pessoa". A rota e a guarda `[unit_admin, global_admin]` **já existem** (Fatia 1
D6) — esta fatia só troca o `element`. *Alternativa descartada:* abrir do
explorador — pessoas não são recurso do explorador; a navegação já prevê a tela
de administração à parte.

### D2 — Unidade: sempre a do admin logado, sem seletor (Opção A)
O `POST /users` aceita `unitId`, mas **não há `GET /units`** para popular um
seletor, e para `unit_admin` o servidor **ignora** o `unitId` (força a própria
unidade). Decisão: a SPA **não** envia `unitId` e **não** mostra seletor de
unidade — a pessoa é criada na unidade do admin logado (o servidor usa
`ctx.unitId` como fallback também para `global_admin`). Isso mantém a fatia
**frontend-pura** e honesta com o back atual. *Alternativa descartada (Opção B):*
adicionar `GET /units` + `Select` de unidade — deixaria de ser só frontend, vira
duas changes; fica registrada como mudança de backend futura. *Alternativa
descartada (campo livre de UUID):* pedir o `unitId` num input de texto —
propenso a erro, sem validação de existência client-side.

### D3 — Um `PessoaFormModal` para criar e editar, campo de senha condicional
Um único `Form` dentro de `Modal` cobre os dois modos: **criar** (`POST /users`,
com campo **senha** obrigatório) e **editar** (`PATCH /users/:id`, **sem** campo
de senha — o endpoint não o aceita). O modo é definido pela presença de uma
`PersonResponse` alvo (`undefined` ⇒ criar). No modo editar, o `Form` é
pré-preenchido com os valores atuais e o **e-mail é somente-leitura** (o `PATCH`
não altera e-mail). *Alternativa descartada:* dois componentes separados —
duplicaria os campos de perfil; o modo condicional é o padrão idiomático do AntD
`Form` e mantém um só ponto de validação.

### D4 — Seletor de papel espelha as travas do servidor (UX, não defesa)
O `Select` de papel oferece `global_admin` **apenas** quando o admin logado é
`global_admin`; para `unit_admin` as opções são só `collaborator`/`unit_admin`.
Isso **espelha** a trava do servidor (`unit_admin` criar/elevar a `global_admin`
→ 403), evitando um caminho que sabidamente falharia — mas é **UX, não linha de
defesa**: se um payload forjado tentasse, o servidor recusa igual. *Alternativa
descartada:* sempre oferecer `global_admin` e tratar o 403 — cria opção-morta
para `unit_admin`, com round-trip e erro a cada tentativa, sem ganho de segurança.

### D5 — Ativar/Desativar por `PATCH status`, com guarda de auto-tiro-no-pé
Não há `DELETE /users`; a ação de linha **"Desativar"/"Ativar"** faz
`PATCH { status }` (com `Popconfirm` ao desativar), invalidando a listagem. Como
desativar a própria conta cortaria o próprio acesso na hora (o servidor relê o
status a cada requisição) e rebaixar o próprio papel removeria o acesso à página,
a SPA **esconde**, na linha do próprio admin (`row.id === identity.id`), as ações
de **desativar** e de **rebaixar papel** — guarda de UX contra o tiro no pé. O
servidor não impede tecnicamente essas auto-ações; a SPA só evita oferecê-las.
*Alternativa descartada:* permitir e mostrar um aviso pós-fato — pior UX, o admin
já teria se deslogado/perdido acesso antes de ler o aviso.

### D6 — E-mail duplicado (409) e 403 tratados sem fechar/vazar
Um **409** no `POST /users` (US 1.1 cenário 2) exibe **"e-mail já está em uso"**
associado ao campo de e-mail, **mantendo o modal aberto** e o restante do
formulário preenchido — o administrador corrige só o e-mail. Um **403** (RLS
escondeu a linha, ou trava de papel) exibe um aviso de **permissão insuficiente**
neutro via o `handlePermissionError` já provado, **sem** distinguir os subcasos.
Demais erros caem no tratamento genérico de `message.error`. *Alternativa
descartada:* fechar o modal no 409 — perderia o preenchimento e obrigaria a
redigitar tudo.

### D7 — Camada de dados: Zod espelhando `@gdoc/shared`, sem `any`
`personResponseSchema: z.ZodType<PersonResponse>` valida a fronteira de
`GET /users`/`POST`/`PATCH` — todos os campos de `PersonResponse` (`id`, `unitId`,
`fullName|null`, `email`, `phone|null`, `jobTitle|null`, `workArea|null`,
`notes|null`, `role`, `status`, `createdAt`), com `role` como `z.enum` de
`UserRole` e `status` como `z.enum` de `PersonStatus`; se o DTO mudar sem o schema
acompanhar, o `tsc` acusa (mesmo `z.ZodType<T>` das outras fatias). Substitui o
uso do `authorPersonSchema` mínimo nesta tela (a busca continua com o dela). Os
hooks `useUsers`/`useCreatePerson`/`useUpdatePerson` vivem em `pessoas/queries.ts`,
espelhando `permissoes/queries.ts` (mutation + `invalidateQueries` da chave de
listagem). Reusa `CreatePersonRequest`/`UpdatePersonRequest` de `@gdoc/shared` —
sem tipo novo em `packages/shared`.

## Risks / Trade-offs

- **Guarda de papel/UX pode divergir do servidor** (dado velho de papel, ou a
  própria conta mudou entre carregar e clicar) → a SPA poderia oferecer/esconder
  uma ação incoerente com o que o servidor fará. Mitigação: o 403/409/RLS do
  servidor é a rede (D4/D6) — esconder opções nunca foi a defesa; um 403 não vaza
  conteúdo.
- **Sem seletor de unidade (D2)** → `global_admin` não cadastra em outra unidade
  pela UI. Mitigação: documentado como lacuna; a esmagadora maioria dos cadastros
  é intra-unidade; `GET /units` + seletor entram numa change de backend futura.
- **Sem redefinição de senha** → esquecimento de senha não se resolve pela UI.
  Mitigação: fora de escopo explícito até o backend expor o endpoint; a senha
  inicial no cadastro cobre o caminho principal.
- **Sem paginação server-side** → uma unidade com muitas pessoas carrega tudo de
  uma vez. Mitigação: `Table` do AntD pagina/filtra no cliente; teto prático alto;
  paginação de servidor entra quando o backend a expuser (mesma decisão da lixeira
  e da auditoria).
- **Auto-tiro-no-pé só barrado na UI (D5)** → um payload forjado ainda poderia
  auto-desativar/rebaixar. Mitigação: é aceitável — o servidor não o impede por
  design, e o efeito recai só sobre quem forjou; nenhuma outra conta é afetada.

## Migration Plan

Sem migração de dados nem de schema — fatia puramente aditiva de frontend. Passos:
adicionar `personResponseSchema`/`personListSchema` (`lib/schemas.ts`), os hooks
`useUsers`/`useCreatePerson`/`useUpdatePerson` e os componentes `PessoasPage` +
`PessoaFormModal` (`pessoas/`), e trocar o `element` da rota `/admin/pessoas` no
`router.tsx` (de `PlaceholderPage` para `PessoasPage`); os testes reusam a infra
existente. Rollback = reverter o commit (nenhum estado persistido, nenhum contrato
alterado, a rota volta ao placeholder).

## Open Questions

Nenhuma bloqueante. Seletor de unidade (via `GET /units`), redefinição de senha e
paginação/filtro server-side são decisões de changes futuras (backend), fora desta
fatia.
