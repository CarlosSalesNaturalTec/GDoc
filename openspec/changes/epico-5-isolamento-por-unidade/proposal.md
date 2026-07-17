## Why

O PRD (`docs/prd_final.md`, Épico 5 / **US 5.1**) define o isolamento por
unidade como requisito de **confidencialidade** ("em nenhuma hipótese o
conteúdo de uma unidade fica visível a outra" — RF #4, NFR de privacidade) e,
ao mesmo tempo, dá ao **Administrador de Unidade** alcance sobre *todo* o
conteúdo da própria unidade — pessoas, pastas, arquivos e permissões.

Metade disso já existe: a RLS por `unit_id` isola tenants em toda tabela e o
`unit_admin` já gerencia **pessoas** (`routes/users.ts`) e **permissões**
(`routes/grants.ts`) restritas à sua unidade. Falta a outra metade: sobre
**pastas e arquivos**, a resolução de acesso (`lib/access.ts`) e a listagem
(`routes/folders.ts`) hoje são **dono-ou-grant para todos os papéis** — o
Épico 4 adiou deliberadamente o alcance amplo do admin (design.md D6:
"alcance administrativo amplo é o Épico 5"). Um `unit_admin` que não seja dono
nem tenha grant recebe 403 ao ver/baixar/gerir um arquivo da própria unidade,
o que contraria a US 5.1 cenário 1. Esta é a fatia que fecha essa fronteira e
prova o cenário 2 (colaborador nunca vê outra unidade, nem por link direto).

## What Changes

- **Ramo "admin da unidade do recurso" na resolução de acesso** (US 5.1
  cenário 1): `hasAccess` passa a autorizar, além de *dono OU grant*, o
  `unit_admin`/`global_admin` sobre qualquer recurso **da sua própria
  unidade**, em todos os verbos (`view`/`download`/`rename`/`upload`), sem
  precisar conceder grant a si mesmo. A RLS por `unit_id` continua sendo a
  fronteira dura: o ramo admin nunca alcança recurso de outra unidade.
- **Listagem/navegação com alcance administrativo** (US 5.1 cenário 1): a
  listagem de pasta e da raiz, e a abertura de pasta, passam a mostrar ao
  admin **todo** o conteúdo da unidade (não só próprio ou liberado), mantendo
  para o `collaborator` a regra atual "próprios OU liberados".
- **BREAKING (intencional, previsto no Épico 4 D6):** reverte a fronteira
  "admin não ganha acesso a conteúdo aqui". Comportamento observável muda —
  um `unit_admin` que antes recebia 403 em `view-url`/`download-url`/`contents`
  de terceiros na sua unidade agora é autorizado. Os testes do Épico 4 que
  fixavam o comportamento antigo são atualizados junto.
- **Prova de isolamento do colaborador** (US 5.1 cenário 2): cobertura de teste
  explícita de que um colaborador (e mesmo um admin) **nunca** enxerga nem
  acessa recurso de outra unidade — por listagem, por resolução de acesso e
  por **link direto** ao identificador (403, sem vazar existência), reforçando
  a RLS já existente com verificação de ponta a ponta.
- **Fora de escopo (mudanças futuras):** qualquer tela/SPA (`apps/web` segue
  esqueleto); exclusão/lixeira e o verbo `delete` (Épico 6); consulta de
  auditoria pelo admin no seu alcance (Épico 7); painel gerencial por alcance
  (Épico 8); busca/filtros (Épico 9); expiração de permissão (Épico 4 Fatia B)
  e download ZIP de pasta (US 3.3).

## Capabilities

### New Capabilities
- `isolamento-unidade`: alcance administrativo do `unit_admin` sobre todo o
  conteúdo da própria unidade (US 5.1 cenário 1) e garantia verificável de que
  nenhuma pessoa — colaborador ou admin — acessa conteúdo de outra unidade por
  navegação, listagem ou link direto (US 5.1 cenário 2).

### Modified Capabilities
- `controle-acesso`: a regra de resolução deixa de ser estritamente "dono OU
  grant do verbo" e passa a "dono OU grant OU **admin da unidade do recurso**";
  a listagem "próprios OU liberados" ganha o ramo "admin vê todo o conteúdo da
  unidade". Reverte explicitamente a fronteira registrada no Épico 4
  (design.md D6), que havia adiado o alcance do admin para este épico.

## Impact

- **Código:** `apps/api/src/lib/access.ts` (`hasAccess` e
  `visibleResourceClause` ganham o ramo admin, dependente do papel do `ctx`);
  `apps/api/src/routes/folders.ts` (`listContents` e abertura de pasta);
  reaproveitado sem mudança de assinatura por `routes/files.ts`
  (view/download/rename/replace) e pelo upload em pasta de terceiros.
- **Sem migração de schema:** o isolamento e o papel já existem
  (`unit_id` + RLS de `0002`; `role` no `ctx`). Nenhuma tabela nova, nenhum
  arquivo de migração.
- **Sem infra/GCP e sem paridade de sandbox:** mudança puramente de lógica de
  aplicação; nada em `infra/terraform` nem no SessionStart hook.
- **Testes:** atualização dos testes do Épico 4 que assumiam admin sem acesso a
  conteúdo, e nova suíte de isolamento cross-unit (listagem, resolução e link
  direto) cobrindo a US 5.1.
