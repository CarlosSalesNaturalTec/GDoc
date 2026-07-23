-- Change `gestao-de-unidades` (design.md D5/D6): a unidade ganha ciclo de
-- vida. Nova coluna `status` (ativa/desativada, espelhando PersonStatus) e
-- unicidade de nome (a lista de unidades vira seletor no cadastro de pessoas;
-- nomes duplicados confundem o global_admin).

-- Coluna aditiva com DEFAULT 'active': o código antigo, que ignora `status`,
-- continua correto durante uma janela de versões mistas (design.md, plano de
-- migração passo 3).
ALTER TABLE units
  ADD COLUMN status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'desativado'));

-- O bootstrap já faz lookup de unidade por nome, então a unicidade é coerente
-- com o comportamento existente. Base atual (bootstrap/seed) tem nomes
-- distintos; se houver duplicatas pré-existentes, esta migração falha de
-- propósito (design.md, Risks/Trade-offs).
CREATE UNIQUE INDEX units_name_uidx ON units (name);
