BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE TABLE memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('viewer', 'operator', 'accountant', 'administrator')),
  grants text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE upstream_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('data_health', 'commerce', 'prepare')),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  label text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'active', 'invalid', 'disconnected')),
  token_fingerprint text,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module, environment, label)
);

CREATE TABLE encrypted_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES upstream_connections(id) ON DELETE CASCADE,
  ciphertext bytea NOT NULL,
  encrypted_data_key bytea NOT NULL,
  nonce bytea NOT NULL,
  algorithm_version text NOT NULL,
  key_reference text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX encrypted_credentials_one_active
  ON encrypted_credentials (connection_id)
  WHERE active;

CREATE TABLE health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES upstream_connections(id) ON DELETE CASCADE,
  snapshot_key text NOT NULL,
  as_of timestamptz NOT NULL,
  formula_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, connection_id, snapshot_key)
);

CREATE TABLE health_snapshot_clients (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES health_snapshots(id) ON DELETE CASCADE,
  dext_client_id text NOT NULL,
  client_name text NOT NULL,
  health_score integer NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  alert_level text NOT NULL,
  normalized_metrics jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (snapshot_id, dext_client_id)
);

CREATE TABLE search_documents (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id text NOT NULL,
  source_module text NOT NULL,
  title text NOT NULL,
  search_text text NOT NULL,
  source_as_of timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(search_text, ''))
  ) STORED,
  PRIMARY KEY (tenant_id, record_id)
);
CREATE INDEX search_documents_vector_idx
  ON search_documents USING gin (search_vector);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  run_after timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX jobs_active_idempotency_idx
  ON jobs (tenant_id, kind, idempotency_key)
  WHERE state IN ('queued', 'running');

CREATE TABLE job_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  outcome text CHECK (outcome IN ('succeeded', 'failed', 'lease_expired')),
  error_code text,
  retryable boolean
);

CREATE TABLE operation_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tool_name text NOT NULL,
  target_hash text NOT NULL,
  input_hash text NOT NULL,
  state_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_records (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  result_reference text,
  state text NOT NULL CHECK (state IN ('pending', 'succeeded', 'failed')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tool_name, idempotency_key)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'error')),
  target_ids text[] NOT NULL DEFAULT '{}',
  error_code text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_tenant_created_idx
  ON audit_events (tenant_id, created_at DESC);

CREATE TABLE file_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  storage_key text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  sha256 text NOT NULL,
  scan_state text NOT NULL CHECK (scan_state IN ('pending', 'clean', 'rejected', 'error')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, storage_key)
);

CREATE TABLE permalink_records (
  public_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, record_id)
);

CREATE FUNCTION current_connector_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE upstream_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_snapshot_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE permalink_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY memberships_tenant_isolation ON memberships
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY upstream_connections_tenant_isolation ON upstream_connections
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY encrypted_credentials_tenant_isolation ON encrypted_credentials
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY health_snapshots_tenant_isolation ON health_snapshots
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY health_snapshot_clients_tenant_isolation ON health_snapshot_clients
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY search_documents_tenant_isolation ON search_documents
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY jobs_tenant_isolation ON jobs
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY job_attempts_tenant_isolation ON job_attempts
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY operation_previews_tenant_isolation ON operation_previews
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY idempotency_records_tenant_isolation ON idempotency_records
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY audit_events_tenant_isolation ON audit_events
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY file_objects_tenant_isolation ON file_objects
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());
CREATE POLICY permalink_records_tenant_isolation ON permalink_records
  USING (tenant_id = current_connector_tenant())
  WITH CHECK (tenant_id = current_connector_tenant());

COMMIT;
