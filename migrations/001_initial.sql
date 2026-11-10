CREATE TABLE IF NOT EXISTS areas (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE
);
INSERT INTO areas (id, name) VALUES
('gerencia', 'Gerencia'), ('administrativa', 'Dirección Administrativa'),
('tesoreria', 'Tesorería'), ('contabilidad', 'Contabilidad'),
('arriendos', 'Arriendos'), ('cartera', 'Cartera') ON CONFLICT DO NOTHING;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  area_id text REFERENCES areas(id),
  is_admin boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL
);
CREATE TABLE login_attempts (
  key text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_events (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  target_id uuid REFERENCES users(id),
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE document_number;
CREATE TABLE documents (
  id uuid PRIMARY KEY,
  number bigint NOT NULL DEFAULT nextval('document_number') UNIQUE,
  subject text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('EGRESO','UPLOAD')),
  origin_area text NOT NULL REFERENCES areas(id),
  created_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING','RECEIVED','RETURNED','AUTHORIZED')),
  responsible_area text NOT NULL REFERENCES areas(id),
  current_version integer NOT NULL DEFAULT 1,
  current_step uuid,
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE versions (
  document_id uuid NOT NULL REFERENCES documents(id),
  number integer NOT NULL,
  subject text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  amount numeric(18,2) CHECK (amount > 0),
  frozen boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id,number)
);
CREATE TABLE files (
  id uuid PRIMARY KEY,
  storage_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  size integer NOT NULL CHECK (size > 0),
  sha256 text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE version_files (
  document_id uuid NOT NULL,
  version integer NOT NULL,
  file_id uuid NOT NULL REFERENCES files(id),
  role text NOT NULL CHECK (role IN ('MAIN','ATTACHMENT')),
  PRIMARY KEY (document_id,version,file_id),
  FOREIGN KEY (document_id,version) REFERENCES versions(document_id,number)
);
CREATE UNIQUE INDEX one_main_file ON version_files(document_id,version) WHERE role='MAIN';
CREATE TABLE steps (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL,
  version integer NOT NULL,
  sender_area text NOT NULL REFERENCES areas(id),
  recipient_area text NOT NULL REFERENCES areas(id),
  sender_id uuid NOT NULL REFERENCES users(id),
  note text NOT NULL DEFAULT '',
  sent_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES users(id),
  received_at timestamptz,
  closed_at timestamptz,
  outcome text CHECK (outcome IN ('FORWARDED','RETURNED','AUTHORIZED')),
  FOREIGN KEY (document_id,version) REFERENCES versions(document_id,number)
);
CREATE UNIQUE INDEX one_open_step ON steps(document_id) WHERE closed_at IS NULL;
ALTER TABLE documents ADD CONSTRAINT current_step_fk FOREIGN KEY (current_step) REFERENCES steps(id);
CREATE TABLE decisions (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL,
  version integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('VISA','AUTHORIZE')),
  area_id text NOT NULL REFERENCES areas(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (document_id,version) REFERENCES versions(document_id,number),
  UNIQUE (document_id,version,kind,area_id)
);
CREATE TABLE events (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id),
  version integer NOT NULL,
  step_id uuid REFERENCES steps(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_name text NOT NULL,
  area_id text NOT NULL REFERENCES areas(id),
  action text NOT NULL,
  note text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX steps_visibility ON steps(document_id,sender_area,recipient_area);
CREATE INDEX documents_inbox ON documents(responsible_area,status);
CREATE INDEX events_document ON events(document_id,created_at);

-- Guardas adicionales: el contenido enviado y el historial son inmutables incluso
-- frente a una escritura accidental desde otra parte de la aplicación.
CREATE FUNCTION protect_frozen_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.frozen THEN RAISE EXCEPTION 'La versión enviada es inmutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_version BEFORE UPDATE OR DELETE ON versions FOR EACH ROW EXECUTE FUNCTION protect_frozen_version();
CREATE FUNCTION protect_version_files() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc uuid; ver integer;
BEGIN
  IF TG_OP = 'DELETE' THEN doc := OLD.document_id; ver := OLD.version;
  ELSE doc := NEW.document_id; ver := NEW.version; END IF;
  IF EXISTS (SELECT 1 FROM versions WHERE document_id=doc AND number=ver AND frozen) THEN
    RAISE EXCEPTION 'Los archivos de una versión enviada son inmutables';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_version_files BEFORE INSERT OR UPDATE OR DELETE ON version_files FOR EACH ROW EXECUTE FUNCTION protect_version_files();
CREATE FUNCTION protect_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'El historial es inmutable'; END $$;
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION protect_history();
CREATE TRIGGER immutable_decisions BEFORE UPDATE OR DELETE ON decisions FOR EACH ROW EXECUTE FUNCTION protect_history();
CREATE TRIGGER immutable_admin_events BEFORE UPDATE OR DELETE ON admin_events FOR EACH ROW EXECUTE FUNCTION protect_history();
