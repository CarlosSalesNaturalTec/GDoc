-- Épico 2 (US 2.2) — robustez da substituição: a emissão de
-- POST /files/:id/replace-url não pode mais mover o ponteiro `object_path`
-- para o objeto novo antes de ele existir. Se o upload da nova versão for
-- abandonado, o arquivo vigente ficaria apontando para um objeto inexistente
-- e se tornaria irrecuperável. `pending_object_path` guarda o destino do
-- objeto novo enquanto `object_path` continua apontando para a versão viva;
-- a reconciliação (/internal/storage-events) promove o ponteiro só quando o
-- novo objeto é finalizado.
ALTER TABLE files ADD COLUMN pending_object_path text;

-- A reconciliação localiza a linha pelo path finalizado — que, numa
-- substituição, é o `pending_object_path`. Índice parcial (só linhas em
-- substituição) para essa busca.
CREATE INDEX files_pending_object_path_idx
  ON files (pending_object_path)
  WHERE pending_object_path IS NOT NULL;
