-- Épico 7 (US 7.1/7.2): índice de leitura para GET /files/:id/audit
-- (design.md D7). A consulta filtra por `file_id` (+ `action`) e ordena por
-- `created_at DESC`; `EXPLAIN ANALYZE` contra ~100k linhas mostrou Parallel
-- Seq Scan (~12ms, varrendo a tabela inteira) sem este índice, contra Bitmap
-- Index Scan (~1ms) com ele. Aditiva, `IF NOT EXISTS`, sem tocar migrações
-- já aplicadas.
CREATE INDEX IF NOT EXISTS audit_events_file_id_created_at_idx
  ON audit_events (file_id, created_at DESC);
