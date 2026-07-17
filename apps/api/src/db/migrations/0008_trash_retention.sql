-- Épico 6 (US 6.1): lixeira com retenção de 30 dias. Arquivo novo — as
-- migrações 0001-0007 já aplicadas não são editadas.

-- Soft-delete por colunas, não por `status` (design.md D1): `status`
-- rastreia o ciclo de upload/substituição, ortogonal à exclusão.
-- `deleted_at IS NULL` = vivo. `trash_root_id` agrupa a operação de
-- exclusão (design.md D4) — permite restaurar a subárvore inteira junto e
-- listar só raízes de exclusão na lixeira (design.md D9).
ALTER TABLE files
  ADD COLUMN deleted_at    timestamptz,
  ADD COLUMN deleted_by    uuid REFERENCES users (id),
  ADD COLUMN trash_root_id uuid;

ALTER TABLE folders
  ADD COLUMN deleted_at    timestamptz,
  ADD COLUMN deleted_by    uuid REFERENCES users (id),
  ADD COLUMN trash_root_id uuid;

-- Índices parciais para a varredura do expurgo (só linhas na lixeira).
CREATE INDEX files_deleted_at_idx   ON files   (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX folders_deleted_at_idx ON folders (deleted_at) WHERE deleted_at IS NOT NULL;

-- Auditoria de delete/restore (design.md D10), mesmo padrão de 0004.
ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check
  CHECK (action IN ('view', 'download', 'rename', 'replace', 'delete', 'restore'));

-- O expurgo apaga fisicamente o arquivo; sem CASCADE, a auditoria do
-- arquivo (NOT NULL REFERENCES) impediria o DELETE por FK (design.md D10).
ALTER TABLE audit_events DROP CONSTRAINT audit_events_file_id_fkey;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_file_id_fkey
  FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE;

-- Item na lixeira resolve como inexistente (design.md D2) — inclusive para
-- unicidade de nome: sem isso, recriar uma pasta com o mesmo nome do pai
-- depois de excluir a original colidiria com a pasta morta no índice único
-- de 0006, quebrando o "excluído = inexistente" no fluxo de upload
-- (ensureFolderPath). O índice passa a valer só entre pastas vivas.
DROP INDEX folders_unit_parent_name_uidx;
CREATE UNIQUE INDEX folders_unit_parent_name_uidx
  ON folders (unit_id, parent_id, lower(name))
  WHERE deleted_at IS NULL;
