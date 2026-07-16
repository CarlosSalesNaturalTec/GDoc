-- Isolamento por unidade imposto no banco (defesa em profundidade).
-- A aplicação define app.current_unit / app.user_role via SET LOCAL por
-- transação (ver adapters/pg-database-port.ts). Sem esse contexto, as
-- funções current_setting(..., true) retornam NULL e a policy nega por
-- padrão (unit_id = NULL nunca é verdadeiro) — fail-closed.
--
-- FORCE ROW LEVEL SECURITY é necessário porque a role da aplicação é dona
-- das tabelas (criadas pelas migrações); sem FORCE, o dono ignora RLS.

ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE units FORCE ROW LEVEL SECURITY;

CREATE POLICY unit_isolation ON units
  USING (
    id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  )
  WITH CHECK (
    id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  );

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY unit_isolation ON users
  USING (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  )
  WITH CHECK (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  );

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;

CREATE POLICY unit_isolation ON files
  USING (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  )
  WITH CHECK (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  );

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY unit_isolation ON audit_events
  USING (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  )
  WITH CHECK (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  );
