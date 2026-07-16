-- Épico 2 (US 2.1/US 2.2): pastas aninhadas, colocação de arquivo em pasta e
-- ampliação da auditoria para renomear/substituir. Arquivo novo — as
-- migrações 0001-0003 já aplicadas não são editadas.

CREATE TABLE folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id    uuid NOT NULL REFERENCES units (id),
  owner_id   uuid NOT NULL REFERENCES users (id),
  parent_id  uuid REFERENCES folders (id),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Mesmo padrão de RLS de 0002_enable_rls.sql: FORCE porque a role da
-- aplicação é dona da tabela; fail-closed sem contexto de tenant.
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders FORCE ROW LEVEL SECURITY;

CREATE POLICY unit_isolation ON folders
  USING (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  )
  WITH CHECK (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  );

CREATE INDEX folders_unit_id_parent_id_idx ON folders (unit_id, parent_id);
CREATE INDEX folders_owner_id_idx ON folders (owner_id);

-- `folder_id` nulo = raiz da unidade (design.md D2) — coluna aditiva,
-- arquivos existentes permanecem válidos na raiz sem backfill.
ALTER TABLE files ADD COLUMN folder_id uuid REFERENCES folders (id);
CREATE INDEX files_unit_id_folder_id_idx ON files (unit_id, folder_id);

-- 'replacing' marca a janela entre a emissão de POST /files/:id/replace-url
-- e a reconciliação em /internal/storage-events: o objeto novo ainda não
-- chegou, mas `size_bytes` na linha continua com o valor da versão vigente
-- até o finalize, o que permite calcular o delta de cota sem contar em
-- dobro (design.md D6) e sem precisar de uma coluna extra só para isso.
ALTER TABLE files DROP CONSTRAINT files_status_check;
ALTER TABLE files ADD CONSTRAINT files_status_check
  CHECK (status IN ('pending', 'active', 'over_quota', 'replacing'));

ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check
  CHECK (action IN ('view', 'download', 'rename', 'replace'));
