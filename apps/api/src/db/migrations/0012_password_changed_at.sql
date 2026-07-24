-- Change `troca-de-senha` (design.md D1/D4): a sessão passa a ser recusada
-- quando emitida antes da última mudança de senha da pessoa. Coluna aditiva
-- com DEFAULT now() para novas linhas; o backfill abaixo usa `created_at`
-- (o instante em que a senha vigente passou a existir) para as linhas já
-- existentes, em vez do instante da migration.
ALTER TABLE users
  ADD COLUMN password_changed_at timestamptz NOT NULL DEFAULT now();

UPDATE users SET password_changed_at = created_at;
