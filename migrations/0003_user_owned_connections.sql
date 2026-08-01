BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM upstream_connections) THEN
    RAISE EXCEPTION
      'upstream_connections contains rows; assign each connection to a specific membership before applying 0003';
  END IF;
END
$$;

ALTER TABLE upstream_connections ADD COLUMN owner_user_id uuid;
ALTER TABLE upstream_connections ALTER COLUMN owner_user_id SET NOT NULL;
ALTER TABLE upstream_connections
  ADD CONSTRAINT upstream_connections_tenant_owner_fkey
  FOREIGN KEY (tenant_id, owner_user_id)
  REFERENCES memberships (tenant_id, user_id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE upstream_connections
  VALIDATE CONSTRAINT upstream_connections_tenant_owner_fkey;

ALTER TABLE upstream_connections
  DROP CONSTRAINT upstream_connections_tenant_id_module_environment_label_key;

DROP INDEX upstream_connections_one_active_data_health;
CREATE UNIQUE INDEX upstream_connections_one_active_per_user_module
  ON upstream_connections (tenant_id, owner_user_id, module)
  WHERE state = 'active';

CREATE FUNCTION current_connector_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

DROP POLICY upstream_connections_tenant_isolation ON upstream_connections;
CREATE POLICY upstream_connections_principal_isolation ON upstream_connections
  USING (
    tenant_id = current_connector_tenant()
    AND owner_user_id = current_connector_user()
  )
  WITH CHECK (
    tenant_id = current_connector_tenant()
    AND owner_user_id = current_connector_user()
  );

DROP POLICY encrypted_credentials_tenant_isolation ON encrypted_credentials;
CREATE POLICY encrypted_credentials_principal_isolation ON encrypted_credentials
  USING (
    tenant_id = current_connector_tenant()
    AND EXISTS (
      SELECT 1
        FROM upstream_connections connection
       WHERE connection.tenant_id = encrypted_credentials.tenant_id
         AND connection.id = encrypted_credentials.connection_id
         AND connection.owner_user_id = current_connector_user()
    )
  )
  WITH CHECK (
    tenant_id = current_connector_tenant()
    AND EXISTS (
      SELECT 1
        FROM upstream_connections connection
       WHERE connection.tenant_id = encrypted_credentials.tenant_id
         AND connection.id = encrypted_credentials.connection_id
         AND connection.owner_user_id = current_connector_user()
    )
  );

DROP POLICY health_snapshots_tenant_isolation ON health_snapshots;
CREATE POLICY health_snapshots_principal_isolation ON health_snapshots
  USING (
    tenant_id = current_connector_tenant()
    AND EXISTS (
      SELECT 1
        FROM upstream_connections connection
       WHERE connection.tenant_id = health_snapshots.tenant_id
         AND connection.id = health_snapshots.connection_id
         AND connection.owner_user_id = current_connector_user()
    )
  )
  WITH CHECK (
    tenant_id = current_connector_tenant()
    AND EXISTS (
      SELECT 1
        FROM upstream_connections connection
       WHERE connection.tenant_id = health_snapshots.tenant_id
         AND connection.id = health_snapshots.connection_id
         AND connection.owner_user_id = current_connector_user()
    )
  );

DROP POLICY health_snapshot_clients_tenant_isolation ON health_snapshot_clients;
CREATE POLICY health_snapshot_clients_principal_isolation
  ON health_snapshot_clients
  USING (
    tenant_id = current_connector_tenant()
    AND EXISTS (
      SELECT 1
        FROM health_snapshots snapshot
        JOIN upstream_connections connection
          ON connection.tenant_id = snapshot.tenant_id
         AND connection.id = snapshot.connection_id
       WHERE snapshot.tenant_id = health_snapshot_clients.tenant_id
         AND snapshot.id = health_snapshot_clients.snapshot_id
         AND connection.owner_user_id = current_connector_user()
    )
  )
  WITH CHECK (
    tenant_id = current_connector_tenant()
    AND EXISTS (
      SELECT 1
        FROM health_snapshots snapshot
        JOIN upstream_connections connection
          ON connection.tenant_id = snapshot.tenant_id
         AND connection.id = snapshot.connection_id
       WHERE snapshot.tenant_id = health_snapshot_clients.tenant_id
         AND snapshot.id = health_snapshot_clients.snapshot_id
         AND connection.owner_user_id = current_connector_user()
    )
  );

DROP POLICY permalink_records_tenant_isolation ON permalink_records;
CREATE POLICY permalink_records_principal_isolation ON permalink_records
  USING (
    tenant_id = current_connector_tenant()
    AND EXISTS (
      SELECT 1
        FROM upstream_connections connection
       WHERE connection.tenant_id = permalink_records.tenant_id
         AND connection.id = permalink_records.connection_id
         AND connection.owner_user_id = current_connector_user()
    )
  )
  WITH CHECK (
    tenant_id = current_connector_tenant()
    AND EXISTS (
      SELECT 1
        FROM upstream_connections connection
       WHERE connection.tenant_id = permalink_records.tenant_id
         AND connection.id = permalink_records.connection_id
         AND connection.owner_user_id = current_connector_user()
    )
  );

COMMIT;
