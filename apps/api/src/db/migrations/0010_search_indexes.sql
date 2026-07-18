-- Épico 9 (US 9.1): índices de apoio para GET /files/search (design.md D5).
-- `file_name ILIKE '%' || $n || '%'` tem curinga à esquerda, que não usa
-- índice B-tree comum — o GIN trigram acelera esse padrão. Índice B-tree em
-- `owner_id` acelera o filtro por autor. Ambos aditivos, `IF NOT EXISTS`,
-- sem tocar migrações já aplicadas.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS files_file_name_trgm_idx
  ON files USING gin (file_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS files_owner_id_idx
  ON files (owner_id);
