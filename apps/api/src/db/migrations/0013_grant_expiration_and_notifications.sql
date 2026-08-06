-- Change `expiracao-permissoes` (US 4.3): prazo de expiração opcional em
-- `grants` + canal de notificação in-app. Arquivo novo — as migrações
-- 0001-0012 já aplicadas não são editadas.

-- Aditiva, sem backfill (design.md D1, Migration Plan passo 1): nulo já
-- significa "permanente", então toda concessão existente permanece válida e
-- nada muda de comportamento no momento da aplicação.
ALTER TABLE grants ADD COLUMN expires_at timestamptz;

-- Índice parcial de apoio à varredura do job por vencimento próximo/atingido
-- (tasks.md 1.2) — só concessões com prazo, sem disputar espaço com o lookup
-- existente `grants_subject_type_permission_idx`, que continua servindo a
-- resolução de acesso (design.md D1, Risks).
CREATE INDEX grants_expires_at_idx ON grants (expires_at) WHERE expires_at IS NOT NULL;

-- Canal de notificação in-app (design.md D4/D5). Dado de unidade ⇒ exige
-- unit_id + RLS, regra dura do projeto (mesmo formato de 0002).
CREATE TABLE notifications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id            uuid NOT NULL REFERENCES units (id),
  recipient_user_id  uuid NOT NULL REFERENCES users (id),
  kind               text NOT NULL CHECK (kind IN ('grant_created', 'grant_expiring', 'grant_expired')),
  payload            jsonb NOT NULL,
  -- Idempotência de emissão (design.md D5): ancorado em (recurso,
  -- vencimento), nunca no id do grant nem no instante da execução — ver o
  -- índice único abaixo.
  source_ref         text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  read_at            timestamptz
);

-- Índice único de deduplicação (design.md D5, tasks.md 1.5): reexecutar o
-- job — retry do Scheduler, deploy no meio da janela, execução manual — não
-- duplica aviso para o mesmo destinatário/tipo/evento de origem.
CREATE UNIQUE INDEX notifications_recipient_kind_source_uidx
  ON notifications (recipient_user_id, kind, source_ref);

-- Leitura da própria caixa de notificações (contagem de não lidas, listagem).
CREATE INDEX notifications_recipient_created_idx ON notifications (recipient_user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY unit_isolation ON notifications
  USING (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  )
  WITH CHECK (
    unit_id = NULLIF(current_setting('app.current_unit', true), '')::uuid
    OR current_setting('app.user_role', true) = 'global_admin'
  );
