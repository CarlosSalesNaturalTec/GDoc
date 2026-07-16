-- Fundação: unidades (tenants) e tabelas com escopo de unidade (unit_id).
-- Nenhuma feature de produto (CRUD de pessoas, permissões granulares) é
-- criada aqui — apenas o mínimo para exercitar RLS, URLs assinadas,
-- auditoria e cota.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units (id),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('collaborator', 'unit_admin', 'global_admin')),
  storage_used_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_unit_id_idx ON users (unit_id);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units (id),
  owner_id uuid NOT NULL REFERENCES users (id),
  object_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'over_quota')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX files_unit_id_idx ON files (unit_id);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units (id),
  user_id uuid NOT NULL REFERENCES users (id),
  file_id uuid NOT NULL REFERENCES files (id),
  action text NOT NULL CHECK (action IN ('view', 'download')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_unit_id_idx ON audit_events (unit_id);
