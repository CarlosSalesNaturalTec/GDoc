# controle-acesso Specification

## Purpose

Define os requisitos verificáveis da imposição de permissão no servidor a
cada ação sobre um arquivo ou pasta, na fatia do Épico 4 / **US 4.2** do PRD
(`docs/prd_final.md`), completando também a **US 2.1, cenário 2** (Épico 2).
Esta capability trata da checagem em tempo de requisição sobre o motor
`grants` definido pela capability `permissoes-granulares`. Os cenários
Given/When/Then das US são vinculantes. A regra de resolução é **dono OU
grant do verbo exigido**, sem herança, fail-closed (ver design.md D2/D3 do
change `epico-4-permissoes-granulares`).

## Requirements

### Requirement: Acesso a conteúdo exige posse ou permissão do verbo correspondente

Toda ação sobre um arquivo ou pasta SHALL ser autorizada no servidor a cada
requisição pela regra **dono do recurso OU admin da unidade do recurso OU
detentor de grant do verbo exigido** pela ação, independentemente da interface
ou de o link ter sido obtido diretamente. Os verbos exigidos SHALL ser: `view`
para emitir URL de visualização e para abrir/listar uma pasta; `download` para
emitir URL de download; `rename` para renomear ou substituir um arquivo;
`upload` para enviar para dentro de uma pasta de outra pessoa. Enviar para a
raiz da unidade ou para pasta própria NÃO SHALL exigir grant.

O ramo **admin da unidade do recurso** SHALL conceder acesso quando o
solicitante é `unit_admin` ou `global_admin` **e** a `unit_id` do recurso é
igual à `unit_id` do contexto autenticado — nesse caso o admin acessa o recurso
em qualquer verbo de conteúdo, sem necessidade de posse ou grant (US 5.1). O
papel de administrador NÃO SHALL, por si só e fora da sua unidade, conceder
acesso a conteúdo: em particular, o bypass de RLS do `global_admin` NÃO SHALL
liberar bytes nem itens de outra unidade (a comparação de `unit_id` é imposta na
aplicação, ainda que a RLS deixe a linha visível). Para o `collaborator`, a
regra permanece **dono OU grant**. A resolução SHALL ser fail-closed (recurso
inexistente ou escondido pela RLS ⇒ negado, sem distinguir os casos).
Referência: PRD US 4.1, US 5.1, RF #10, NFR de confidencialidade; revisão do D6
do change `epico-4-permissoes-granulares`.

#### Scenario: Não-dono da mesma unidade sem permissão é bloqueado
- **WHEN** um `collaborator` solicita a URL de visualização ou de download de um
  arquivo da sua unidade que não lhe pertence e sobre o qual não tem o verbo
  correspondente
- **THEN** o acesso é negado com 403, nenhuma URL assinada é emitida e nenhum
  registro de auditoria é gravado

#### Scenario: Detentor do verbo acessa e é auditado
- **WHEN** uma pessoa com grant `view` (ou `download`) sobre um arquivo solicita a
  URL correspondente
- **THEN** a URL assinada de TTL curto é emitida e o acesso é registrado na auditoria
  com a ação correspondente

#### Scenario: Renomear/substituir exige o verbo rename
- **WHEN** um `collaborator` sem posse e sem grant `rename` tenta renomear ou
  substituir um arquivo
- **THEN** a ação é bloqueada com 403; e, com grant `rename`, a ação é permitida

#### Scenario: Enviar para pasta de outra pessoa exige o verbo upload
- **WHEN** um `collaborator` tenta enviar um arquivo para dentro de uma pasta que
  não lhe pertence, sem grant `upload` sobre essa pasta
- **THEN** o envio é bloqueado; e, com grant `upload` sobre a pasta, o envio é
  permitido

#### Scenario: Admin da unidade acessa conteúdo da unidade sem grant
- **WHEN** um `unit_admin` (ou um `global_admin` cuja unidade é a do recurso)
  solicita a URL de visualização/download, renomeia ou substitui um arquivo da
  sua unidade que não criou nem lhe foi concedido
- **THEN** o acesso é concedido pelo ramo admin-da-unidade e auditado quando for
  visualização/download

#### Scenario: global_admin não acessa conteúdo de outra unidade
- **WHEN** um `global_admin` solicita a URL de visualização/download de um
  arquivo pertencente a uma unidade diferente da do seu contexto, sem posse nem
  grant
- **THEN** o acesso é negado com 403, sem URL e sem auditoria, mesmo que o bypass
  de RLS torne a linha do arquivo visível ao papel

### Requirement: Bloqueio de acesso por link direto sem exposição de conteúdo

O acesso direto pela rota de um arquivo sem permissão SHALL ser bloqueado sem expor
nenhum conteúdo nem pré-visualização do arquivo, e sem distinguir "arquivo
inexistente" de "arquivo existente sem permissão" (não vazar existência). Como a URL
assinada só é emitida **após** a checagem de permissão no servidor e o bucket é
100% privado, um link direto ao objeto nunca SHALL contornar a verificação.
Referência: PRD US 4.2, cenário 1.

#### Scenario: Link direto a arquivo sem permissão
- **WHEN** uma pessoa aciona a rota de um arquivo para o qual não tem permissão,
  ainda que conheça seu identificador
- **THEN** recebe 403, nenhuma URL nem pré-visualização é retornada, e a resposta não
  revela se o arquivo existe

### Requirement: Listagem de pasta restrita a itens próprios ou liberados

A listagem do conteúdo de uma pasta (e da raiz da unidade) SHALL retornar, para
um `collaborator`, apenas os itens que a pessoa **criou** OU sobre os quais
possui grant `view` — arquivos e subpastas —, nunca itens de terceiros sem
liberação. Para um **admin da unidade** (solicitante `unit_admin` ou
`global_admin` cuja `unit_id` é a da listagem), a listagem SHALL retornar
**todos** os itens da unidade, sem exigir posse ou grant. Para o `global_admin`,
a listagem SHALL ser restringida à sua unidade na própria consulta (não confiar
no bypass de RLS para evitar trazer itens de outra unidade). Abrir uma pasta
SHALL exigir posse, grant `view` **ou** ser admin da unidade da pasta. Como não
há herança, abrir uma pasta liberada por grant SHALL mostrar apenas os filhos
igualmente próprios ou liberados (o alcance amplo de unidade vale só para o
admin). Referência: PRD US 2.1, cenário 2; US 4.1, cenário 2; US 5.1.

#### Scenario: Listagem mostra criados e liberados, oculta o resto (collaborator)
- **WHEN** um `collaborator` abre uma pasta que contém itens próprios, itens
  liberados a ele e itens de terceiros sem liberação
- **THEN** vê apenas os itens que criou e os que lhe foram liberados, e os itens sem
  permissão não aparecem

#### Scenario: Abrir pasta sem posse nem view é negado (collaborator)
- **WHEN** um `collaborator` tenta abrir/listar uma pasta que não lhe pertence e
  sobre a qual não tem grant `view`
- **THEN** o acesso é negado com 403, sem revelar o conteúdo nem a existência da pasta

#### Scenario: Admin da unidade lista todos os itens da unidade
- **WHEN** um `unit_admin` abre uma pasta da sua unidade que contém itens de
  vários donos, sem grant sobre eles
- **THEN** vê todos os itens da pasta pertencentes à sua unidade

#### Scenario: Listagem do global_admin não vaza itens de outra unidade
- **WHEN** um `global_admin` lista o conteúdo de uma pasta da sua unidade
- **THEN** vê apenas itens da sua unidade, sem que o bypass de RLS traga itens de
  outras unidades para a listagem
