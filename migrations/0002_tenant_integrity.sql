BEGIN;

CREATE TABLE tenant_identities (
  issuer text NOT NULL,
  external_tenant_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, external_tenant_id),
  UNIQUE (tenant_id, issuer, external_tenant_id)
);

ALTER TABLE upstream_connections
  ADD CONSTRAINT upstream_connections_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE health_snapshots
  ADD CONSTRAINT health_snapshots_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE jobs
  ADD CONSTRAINT jobs_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE UNIQUE INDEX upstream_connections_one_active_data_health
  ON upstream_connections (tenant_id, module)
  WHERE state = 'active';

ALTER TABLE encrypted_credentials ADD COLUMN auth_tag bytea;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM encrypted_credentials) THEN
    RAISE EXCEPTION 'encrypted_credentials contains rows; re-encrypt them with authenticated envelope format before applying 0002';
  END IF;
END
$$;

DROP INDEX encrypted_credentials_one_active;
CREATE UNIQUE INDEX encrypted_credentials_one_active
  ON encrypted_credentials (tenant_id, connection_id)
  WHERE active;

ALTER TABLE encrypted_credentials
  DROP CONSTRAINT encrypted_credentials_connection_id_fkey;
ALTER TABLE encrypted_credentials
  ADD CONSTRAINT encrypted_credentials_tenant_connection_fkey
  FOREIGN KEY (tenant_id, connection_id)
  REFERENCES upstream_connections (tenant_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE health_snapshots
  DROP CONSTRAINT health_snapshots_connection_id_fkey;
ALTER TABLE health_snapshots
  ADD CONSTRAINT health_snapshots_tenant_connection_fkey
  FOREIGN KEY (tenant_id, connection_id)
  REFERENCES upstream_connections (tenant_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE health_snapshot_clients
  DROP CONSTRAINT health_snapshot_clients_snapshot_id_fkey;
ALTER TABLE health_snapshot_clients
  DROP CONSTRAINT health_snapshot_clients_pkey;
ALTER TABLE health_snapshot_clients
  ADD CONSTRAINT health_snapshot_clients_pkey
  PRIMARY KEY (tenant_id, snapshot_id, dext_client_id);
ALTER TABLE health_snapshot_clients
  ADD CONSTRAINT health_snapshot_clients_tenant_snapshot_fkey
  FOREIGN KEY (tenant_id, snapshot_id)
  REFERENCES health_snapshots (tenant_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE job_attempts DROP CONSTRAINT job_attempts_job_id_fkey;
ALTER TABLE job_attempts
  ADD CONSTRAINT job_attempts_tenant_job_fkey
  FOREIGN KEY (tenant_id, job_id)
  REFERENCES jobs (tenant_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE operation_previews
  DROP CONSTRAINT operation_previews_actor_user_id_fkey;
ALTER TABLE operation_previews
  ADD CONSTRAINT operation_previews_tenant_actor_fkey
  FOREIGN KEY (tenant_id, actor_user_id)
  REFERENCES memberships (tenant_id, user_id)
  ON DELETE RESTRICT NOT VALID;

ALTER TABLE file_objects
  DROP CONSTRAINT file_objects_owner_user_id_fkey;
ALTER TABLE file_objects
  ADD CONSTRAINT file_objects_tenant_owner_fkey
  FOREIGN KEY (tenant_id, owner_user_id)
  REFERENCES memberships (tenant_id, user_id)
  ON DELETE RESTRICT NOT VALID;

ALTER TABLE audit_events
  DROP CONSTRAINT audit_events_actor_user_id_fkey;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_tenant_actor_fkey
  FOREIGN KEY (tenant_id, actor_user_id)
  REFERENCES memberships (tenant_id, user_id)
  ON DELETE SET NULL (actor_user_id) NOT VALID;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM permalink_records) THEN
    RAISE EXCEPTION 'permalink_records contains rows; assign connection ownership before applying 0002';
  END IF;
END
$$;

ALTER TABLE permalink_records ADD COLUMN connection_id uuid;
ALTER TABLE permalink_records
  ALTER COLUMN connection_id SET NOT NULL;
ALTER TABLE permalink_records
  DROP CONSTRAINT permalink_records_tenant_id_record_id_key;
ALTER TABLE permalink_records
  ADD CONSTRAINT permalink_records_tenant_connection_record_key
  UNIQUE (tenant_id, connection_id, record_id);
ALTER TABLE permalink_records
  ADD CONSTRAINT permalink_records_tenant_connection_fkey
  FOREIGN KEY (tenant_id, connection_id)
  REFERENCES upstream_connections (tenant_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE encrypted_credentials
  ALTER COLUMN auth_tag SET NOT NULL;

ALTER TABLE encrypted_credentials
  VALIDATE CONSTRAINT encrypted_credentials_tenant_connection_fkey;
ALTER TABLE health_snapshots
  VALIDATE CONSTRAINT health_snapshots_tenant_connection_fkey;
ALTER TABLE health_snapshot_clients
  VALIDATE CONSTRAINT health_snapshot_clients_tenant_snapshot_fkey;
ALTER TABLE job_attempts
  VALIDATE CONSTRAINT job_attempts_tenant_job_fkey;
ALTER TABLE operation_previews
  VALIDATE CONSTRAINT operation_previews_tenant_actor_fkey;
ALTER TABLE file_objects
  VALIDATE CONSTRAINT file_objects_tenant_owner_fkey;
ALTER TABLE audit_events
  VALIDATE CONSTRAINT audit_events_tenant_actor_fkey;
ALTER TABLE permalink_records
  VALIDATE CONSTRAINT permalink_records_tenant_connection_fkey;

ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE upstream_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE encrypted_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE health_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE health_snapshot_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE search_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE job_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE operation_previews FORCE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE file_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE permalink_records FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dext_connector_app') THEN
    CREATE ROLE dext_connector_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO dext_connector_app;
GRANT SELECT ON tenants, users, tenant_identities TO dext_connector_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  memberships,
  upstream_connections,
  encrypted_credentials,
  health_snapshots,
  health_snapshot_clients,
  search_documents,
  jobs,
  job_attempts,
  operation_previews,
  idempotency_records,
  audit_events,
  file_objects,
  permalink_records
TO dext_connector_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dext_connector_app;

COMMIT;
