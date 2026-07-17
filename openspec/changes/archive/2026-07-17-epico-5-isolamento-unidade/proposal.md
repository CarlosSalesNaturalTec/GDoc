## Why

O isolamento entre unidades já existe como **defesa em profundidade** (RLS por
`unit_id`), mas o PRD (`docs/prd_final.md`, Épico 5 / **US 5.1**) exige mais do
que "não vazar": exige um **alcance administrativo positivo** — o
`unit_admin` deve *ver e gerir* pessoas, pastas, arquivos e permissões **da sua
unidade**, e o `collaborator` nunca deve enxergar outra unidade nem por busca
nem por link direto. Hoje falta o lado positivo desse alcance: a resolução de
acesso a conteúdo é **dono-OU-grant para todos os papéis** (Épico 4, design D6),
então um `unit_admin` não consegue abrir nem listar um arquivo da própria
unidade que não criou nem se autoconcedeu — contradizendo a US 5.1.

Esta mudança entrega o **ramo administrativo** da resolução de acesso e, ao
fazê-lo, **revisa a decisão D6 do Épico 4** sobre o `global_admin`, conforme
decisão de produto tomada nesta exploração (Opção B).

## What Changes

- **Ramo "admin da unidade do recurso" na resolução de acesso** (US 5.1): a
  regra deixa de ser só "dono OU grant" e passa a ser **"dono OU grant OU admin
  da unidade do recurso"**. Um `unit_admin` acessa (visualizar, baixar,
  renomear/substituir, enviar) e **lista** qualquer pasta/arquivo cuja
  `unit_id` seja a sua, sem precisar de grant nem de posse. Impõe-se em
  `apps/api/src/lib/access.ts` (`hasAccess` e `visibleResourceClause`) — o
  único ponto que já centraliza a regra.
- **Ajuste da decisão do `global_admin` (revisão do D6 — Opção B)**: o
  `global_admin` acessa **conteúdo** pela mesma regra de admin **amarrada a uma
  unidade** (`resource.unit_id == ctx.unitId`), e **não** por bypass de RLS
  sobre bytes. Assim ele deixa de ser um "olho universal" sobre documentos:
  para abrir um arquivo específico ele age no escopo de uma unidade (rastro na
  auditoria, mesmo modelo do `unit_admin`), enquanto **painel/agregados**
  (contagens e somas do Épico 8) continuam cross-unit via o bypass de RLS — que
  passa a valer **para agregados, não para bytes**. Fecha o furo latente de o
  `global_admin` ler qualquer arquivo de qualquer unidade por baixo de RLS.
- **Isolamento verificável do colaborador** (US 5.1, cenário 2): tornar
  explícito e testável que `collaborator` nunca alcança conteúdo de outra
  unidade — por listagem, por busca (quando existir, Épico 9) e por link direto
  ao id — reforçando a RLS como fronteira real e a app como camada de
  autorização por cima dela.
- **Endpoints administrativos já existentes ganham a semântica de unidade
  correta**: `GET /grants`, CRUD de pessoas (`routes/users.ts`) e as rotas de
  conteúdo passam a refletir "alcance = minha unidade" de forma uniforme para
  o admin (a maior parte já é imposta pela RLS; esta mudança alinha o **acesso
  a conteúdo** ao mesmo alcance).

**BREAKING (comportamental, interno):** para o `global_admin`, o acesso a
conteúdo cross-unit via `view-url`/`download-url` que o bypass de RLS deixava
passar é **restringido** à sua unidade. É intencional e coerente com o RNF de
confidencialidade; não há consumidor externo em produção (nenhum projeto GCP
vivo). Os agregados de painel não são afetados.

Fora de escopo (fatias futuras):

- **Troca explícita de escopo de unidade pelo `global_admin`** (impersonar/
  "entrar em" outra unidade para operar conteúdo lá) — mecanismo de UI/sessão;
  por ora, conteúdo de outra unidade exige autogrant (auditado) ou fica para
  fatia futura. Esta fatia entrega o **alcance por unidade**, não a troca de
  unidade.
- **Painel gerencial e agregados** (Épico 8) — esta fatia apenas **preserva** o
  bypass de RLS para agregados; os endpoints/gráficos do painel são o Épico 8.
- **Busca e filtros** (Épico 9) — o requisito "colaborador não encontra outra
  unidade por busca" é declarado aqui como invariante de isolamento, mas a
  busca em si é o Épico 9.

## Capabilities

### New Capabilities

- `isolamento-unidade`: alcance administrativo positivo por unidade — o
  `unit_admin` vê e gere pessoas, pastas, arquivos e permissões **da sua
  unidade** (e só dela); o `global_admin` opera conteúdo no mesmo modelo,
  amarrado a uma unidade, com agregados cross-unit preservados; o
  `collaborator` nunca alcança outra unidade por navegação, busca ou link
  direto. Cobre **US 5.1** (cenários 1 e 2).

### Modified Capabilities

- `controle-acesso`: a resolução de acesso a conteúdo, hoje "dono OU grant para
  **todos** os papéis, sem que o papel de admin conceda acesso", passa a
  incluir o ramo **"OU admin da unidade do recurso"**; e a listagem de pasta,
  hoje "apenas itens próprios ou liberados", passa a mostrar **todos os itens
  da unidade** quando o solicitante é admin daquela unidade. A regra de
  `global_admin` (antes: bypass de RLS deixava acessar conteúdo cross-unit)
  passa a **restringir** conteúdo à unidade, preservando o bypass só para
  agregados. Referência: revisão do D6 do change arquivado
  `epico-4-permissoes-granulares`.

## Impact

- **Código**: `apps/api/src/lib/access.ts` (`hasAccess`, `visibleResourceClause`
  ganham o ramo admin-da-unidade); `apps/api/src/routes/folders.ts` e
  `apps/api/src/routes/files.ts` (listagem/checagem passam a considerar o ramo
  admin); possivelmente um helper `isAdminOfUnit(ctx, resourceUnitId)` em
  `lib/access.ts`.
- **Banco**: nenhuma tabela nova nem migração — o alcance é derivado de `role`
  + `unit_id` já existentes. As policies RLS de `0002_enable_rls.sql`
  permanecem intactas (continuam sendo a fronteira dura); a mudança é de
  **autorização na aplicação por cima** delas.
- **Contratos** (`packages/shared`): sem novos DTOs esperados (a mudança é de
  regra de acesso, não de payload); confirmar na fase de design.
- **Testes**: novos cenários de isolamento e de alcance admin em
  `apps/api/src/__tests__/` (padrão `seedTwoUnits` + `withSystemBypass` já
  existente), incluindo a regressão do `global_admin` restringido a bytes da
  própria unidade.
- **PRD/OpenSpec**: consome US 5.1; revisa formalmente a decisão D6 do Épico 4.
