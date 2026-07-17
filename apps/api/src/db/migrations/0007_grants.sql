-- Épico 4 (Fatia A, US 4.1/4.2): motor de permissão granular por pessoa.
-- Arquivo novo — as migrações 0001-0006 já aplicadas não são editadas.

CREATE TABLE grants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id          uuid NOT NULL REFERENCES units (id),
  subject_user_id  uuid NOT NULL REFERENCES users (id),
  resource_type    text NOT NULL CHECK (resource_type IN ('folder', 'file')),
  resource_id      uuid NOT NULL,
  permission       text NOT NULL CHECK (permission IN ('view', 'download', 'upload', 'rename', 'delete')),
  granted_by       uuid NOT NULL REFERENCES users (id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Idempotência de concessão (design.md D1): reconceder o mesmo verbo sobre o
-- mesmo recurso para a mesma pessoa é um ON CONFLICT DO NOTHING, não erro.
CREATE UNIQUE INDEX grants_subject_resource_permission_uidx
  ON grants (unit_id, subject_user_id, resource_type, resource_id, permission);

-- Lookup da resolução de acesso (hasAccess) e da listagem por grant "view".
CREATE INDEX grants_subject_type_permission_idx
  ON grants (subject_user_id, resource_type, permission);

-- Mesmo padrão de RLS de 0002_enable_rls.sql: FORCE porque a role da
-- aplicação é dona da tabela; fail-closed sem contexto de tenant.
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants FORCE ROW LEVEL SECURITY;

CREATE POLICY unit_isolation ON grants
  USING (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  )
  WITH CHECK (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  );
