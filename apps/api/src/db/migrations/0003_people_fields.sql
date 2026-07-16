-- Campos de pessoa (PRD US 1.1) e status de conta ativa/desativada (US 1.2)
-- em `users`. Arquivo novo — a migração 0001 já aplicada não é editada.
-- `unit_id` e a policy RLS de 0002_enable_rls.sql já cobrem estas colunas
-- (a policy é por linha, não por coluna), então nenhuma policy nova é
-- necessária aqui.

ALTER TABLE users
  ADD COLUMN full_name text,
  ADD COLUMN phone text,
  ADD COLUMN job_title text,
  ADD COLUMN work_area text,
  ADD COLUMN notes text,
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'));
