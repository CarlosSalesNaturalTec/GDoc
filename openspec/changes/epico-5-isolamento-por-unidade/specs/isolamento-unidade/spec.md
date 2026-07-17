## ADDED Requirements

### Requirement: Administrador de unidade alcança todo o conteúdo da própria unidade

O `unit_admin` SHALL ver e gerir todas as pessoas, pastas, arquivos e permissões
da **própria unidade**, sem necessidade de ser dono nem de possuir grant sobre
cada recurso. Sobre pastas e arquivos, a resolução de acesso SHALL autorizar o
`unit_admin` em todos os verbos (`view`, `download`, `rename`, `upload`) para
qualquer recurso da sua unidade, e a listagem SHALL exibir-lhe todo o conteúdo do
nível — não apenas o próprio ou o liberado. Esse alcance SHALL ficar restrito à
unidade do administrador: recurso de outra unidade NÃO SHALL ser acessível nem
listável, mesmo para o administrador. Acessos de visualização e download pelo
administrador SHALL ser registrados na auditoria como qualquer outro acesso.
Referência: PRD US 5.1, cenário 1; RF #3, RF #4.

#### Scenario: Admin acessa arquivo de terceiro da própria unidade
- **WHEN** um `unit_admin` solicita a URL de visualização ou de download de um
  arquivo da sua unidade que pertence a outra pessoa e sobre o qual não tem grant
- **THEN** a URL assinada de TTL curto é emitida e o acesso é registrado na
  auditoria, sem exigir concessão prévia

#### Scenario: Admin lista todo o conteúdo da unidade
- **WHEN** um `unit_admin` abre a raiz ou uma pasta da sua unidade que contém
  itens de várias pessoas
- **THEN** vê todas as pastas e arquivos daquele nível, inclusive os de outras
  pessoas, e pode abrir pastas de terceiros da sua unidade

#### Scenario: Alcance do admin não cruza a unidade
- **WHEN** um `unit_admin` tenta acessar ou listar um recurso pertencente a outra
  unidade, ainda que conheça seu identificador
- **THEN** o acesso é negado com 403 e o recurso não aparece em nenhuma listagem,
  sem revelar sua existência

### Requirement: Colaborador nunca acessa conteúdo de outra unidade

Nenhum colaborador SHALL ver nem acessar arquivos ou pastas pertencentes a uma
unidade diferente da sua — por navegação, listagem ou link direto ao
identificador. A tentativa de acesso direto a um recurso de outra unidade SHALL
ser negada com 403 sem distinguir "recurso inexistente" de "recurso de outra
unidade" (não vazar existência), e o isolamento SHALL ser garantido pela RLS por
`unit_id` (defesa em profundidade), não apenas por checagem de aplicação.
Referência: PRD US 5.1, cenário 2; RF #4; NFR de privacidade entre unidades.

#### Scenario: Colaborador não vê itens de outra unidade na navegação
- **WHEN** um colaborador navega pela raiz ou por pastas
- **THEN** nunca aparece qualquer pasta ou arquivo pertencente a outra unidade

#### Scenario: Link direto a recurso de outra unidade é bloqueado
- **WHEN** um colaborador aciona a rota de um arquivo ou pasta de outra unidade
  usando seu identificador
- **THEN** recebe 403, nenhuma URL nem pré-visualização é retornada, e a resposta
  não revela se o recurso existe
