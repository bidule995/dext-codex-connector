import pg, { type Pool, type PoolClient } from "pg";

import type {
  AuthContext,
  ExternalIdentityRepository
} from "../auth/types.js";
import type { DextClientSummary } from "../contracts/dext-health.js";
import { DextClientSummarySchema } from "../contracts/dext-health.js";
import { ConnectorError, ConnectorErrorCode } from "../errors.js";
import type {
  AuditEvent,
  AuditSink,
  ConnectionRepository,
  CredentialRepository,
  EncryptedCredential,
  HealthSnapshot,
  PermalinkRecord,
  PermalinkRepository,
  SnapshotRepository,
  UpstreamConnection
} from "./repositories.js";

const { Pool: PgPool } = pg;

interface IdentityRow {
  tenant_id: string;
  user_id: string;
  tenant_state: string;
}

export class PostgresRepositories
  implements
    AuditSink,
    ConnectionRepository,
    CredentialRepository,
    SnapshotRepository,
    PermalinkRepository,
    ExternalIdentityRepository
{
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new PgPool({ connectionString, max: 10 });
  }

  close(): Promise<void> {
    return this.pool.end();
  }

  async resolveIdentity(
    issuer: string,
    externalTenantId: string,
    subject: string,
    tokenScopes: ReadonlySet<string>
  ): Promise<AuthContext> {
    const result = await this.pool.query<IdentityRow>(
      `SELECT ti.tenant_id,
              u.id AS user_id,
              t.state AS tenant_state
         FROM tenant_identities ti
         JOIN tenants t ON t.id = ti.tenant_id
         JOIN users u ON u.issuer = $1 AND u.subject = $3
        WHERE ti.issuer = $1 AND ti.external_tenant_id = $2`,
      [issuer, externalTenantId, subject]
    );
    const row = result.rows[0];
    if (
      result.rowCount !== 1 ||
      !row ||
      row.tenant_state !== "active"
    ) {
      throw new ConnectorError({
        code: ConnectorErrorCode.AuthenticationRequired,
        message: "The OAuth identity is not linked to an active connector tenant."
      });
    }
    const membership = await this.withTenant(row.tenant_id, async (client) =>
      client.query<{ grants: string[] }>(
        `SELECT grants
           FROM memberships
          WHERE tenant_id = $1 AND user_id = $2 AND active`,
        [row.tenant_id, row.user_id]
      )
    );
    const membershipRow = membership.rows[0];
    if (membership.rowCount !== 1 || !membershipRow) {
      throw new ConnectorError({
        code: ConnectorErrorCode.AuthenticationRequired,
        message: "The OAuth identity is not linked to an active connector membership."
      });
    }
    const granted = new Set(membershipRow.grants);
    return {
      tenantId: row.tenant_id,
      userId: row.user_id,
      scopes: new Set([...tokenScopes].filter((scope) => granted.has(scope))),
      mode: "oauth"
    };
  }

  async record(event: Omit<AuditEvent, "id" | "at">): Promise<void> {
    await this.withTenant(event.tenantId, async (client) => {
      await client.query(
        `INSERT INTO audit_events
          (tenant_id, actor_user_id, tool_name, outcome, target_ids, error_code)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          event.tenantId,
          event.userId,
          event.tool,
          event.outcome,
          event.targetIds,
          event.errorCode ?? null
        ]
      );
    });
  }

  async getActiveForModule(
    tenantId: string,
    module: "data_health"
  ): Promise<UpstreamConnection> {
    return this.withTenant(tenantId, async (client) => {
      const result = await client.query<{
        id: string;
        tenant_id: string;
        module: "data_health";
        state: UpstreamConnection["state"];
      }>(
        `SELECT id, tenant_id, module, state
           FROM upstream_connections
          WHERE tenant_id = $1 AND module = $2 AND state = 'active'
          ORDER BY created_at DESC
          LIMIT 2`,
        [tenantId, module]
      );
      if (result.rowCount !== 1 || !result.rows[0]) {
        throw new ConnectorError({
          code:
            result.rowCount === 0
              ? ConnectorErrorCode.NotFound
              : ConnectorErrorCode.Conflict,
          message:
            result.rowCount === 0
              ? "No active Dext Data Health connection exists for this tenant."
              : "More than one active Dext Data Health connection exists for this tenant."
        });
      }
      const row = result.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        module: row.module,
        state: row.state
      };
    });
  }

  async getActiveForConnection(
    tenantId: string,
    connectionId: string
  ): Promise<EncryptedCredential> {
    return this.withTenant(tenantId, async (client) => {
      const result = await client.query<{
        id: string;
        tenant_id: string;
        connection_id: string;
        ciphertext: Buffer;
        encrypted_data_key: Buffer;
        nonce: Buffer;
        auth_tag: Buffer;
        algorithm_version: string;
        key_reference: string;
      }>(
        `SELECT id, tenant_id, connection_id, ciphertext, encrypted_data_key,
                nonce, auth_tag, algorithm_version, key_reference
           FROM encrypted_credentials
          WHERE tenant_id = $1 AND connection_id = $2 AND active
          LIMIT 1`,
        [tenantId, connectionId]
      );
      const row = result.rows[0];
      if (result.rowCount !== 1 || !row) {
        throw new ConnectorError({
          code: ConnectorErrorCode.AuthenticationRequired,
          message: "The tenant's Dext Data Health credential is unavailable."
        });
      }
      return {
        id: row.id,
        tenantId: row.tenant_id,
        connectionId: row.connection_id,
        ciphertext: row.ciphertext,
        encryptedDataKey: row.encrypted_data_key,
        nonce: row.nonce,
        authTag: row.auth_tag,
        algorithmVersion: row.algorithm_version,
        keyReference: row.key_reference
      };
    });
  }

  async create(input: Omit<HealthSnapshot, "id">): Promise<HealthSnapshot> {
    return this.withTenant(input.tenantId, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO health_snapshots
          (tenant_id, connection_id, snapshot_key, as_of, formula_version)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, connection_id, snapshot_key)
         DO UPDATE SET snapshot_key = EXCLUDED.snapshot_key
         RETURNING id`,
        [
          input.tenantId,
          input.connectionId,
          input.snapshotKey,
          input.asOf,
          input.formulaVersion
        ]
      );
      const id = inserted.rows[0]!.id;
      const values: unknown[] = [];
      const rows = input.clients.map((record, index) => {
        const offset = index * 7;
        values.push(
          input.tenantId,
          id,
          record.id,
          record.name,
          record.healthScore,
          record.alertLevel,
          JSON.stringify(record)
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb)`;
      });
      if (rows.length > 0) {
        await client.query(
          `INSERT INTO health_snapshot_clients
            (tenant_id, snapshot_id, dext_client_id, client_name,
             health_score, alert_level, normalized_metrics)
           VALUES ${rows.join(",")}
           ON CONFLICT (tenant_id, snapshot_id, dext_client_id)
           DO UPDATE SET client_name = EXCLUDED.client_name,
                         health_score = EXCLUDED.health_score,
                         alert_level = EXCLUDED.alert_level,
                         normalized_metrics = EXCLUDED.normalized_metrics`,
          values
        );
      }
      return { ...structuredClone(input), id };
    });
  }

  async get(tenantId: string, snapshotId: string): Promise<HealthSnapshot> {
    return this.withTenant(tenantId, async (client) => {
      const snapshot = await client.query<{
        id: string;
        tenant_id: string;
        connection_id: string;
        snapshot_key: string;
        as_of: Date;
        formula_version: string;
      }>(
        `SELECT id, tenant_id, connection_id, snapshot_key, as_of, formula_version
           FROM health_snapshots
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, snapshotId]
      );
      const row = snapshot.rows[0];
      if (!row) {
        throw new ConnectorError({
          code: ConnectorErrorCode.NotFound,
          message: `Health snapshot ${snapshotId} was not found.`
        });
      }
      const clientRows = await client.query<{ normalized_metrics: unknown }>(
        `SELECT normalized_metrics
           FROM health_snapshot_clients
          WHERE tenant_id = $1 AND snapshot_id = $2
          ORDER BY dext_client_id`,
        [tenantId, snapshotId]
      );
      const clients: DextClientSummary[] = clientRows.rows.map((entry) =>
        DextClientSummarySchema.parse(entry.normalized_metrics)
      );
      return {
        id: row.id,
        tenantId: row.tenant_id,
        connectionId: row.connection_id,
        snapshotKey: row.snapshot_key,
        asOf: row.as_of.toISOString(),
        formulaVersion: row.formula_version,
        clients
      };
    });
  }

  async getOrCreate(
    tenantId: string,
    connectionId: string,
    recordId: string
  ): Promise<PermalinkRecord> {
    return this.withTenant(tenantId, async (client) => {
      const result = await client.query<{
        public_id: string;
        tenant_id: string;
        connection_id: string;
        record_id: string;
      }>(
        `INSERT INTO permalink_records (tenant_id, connection_id, record_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, connection_id, record_id)
         DO UPDATE SET record_id = EXCLUDED.record_id
         RETURNING public_id, tenant_id, connection_id, record_id`,
        [tenantId, connectionId, recordId]
      );
      return this.toPermalink(result.rows[0]!);
    });
  }

  async resolve(
    tenantId: string,
    publicId: string
  ): Promise<PermalinkRecord> {
    return this.withTenant(tenantId, async (client) => {
      const result = await client.query<{
        public_id: string;
        tenant_id: string;
        connection_id: string;
        record_id: string;
      }>(
        `SELECT public_id, tenant_id, connection_id, record_id
           FROM permalink_records
          WHERE tenant_id = $1 AND public_id = $2`,
        [tenantId, publicId]
      );
      const row = result.rows[0];
      if (!row) {
        throw new ConnectorError({
          code: ConnectorErrorCode.NotFound,
          message: "The Dext record was not found."
        });
      }
      return this.toPermalink(row);
    });
  }

  async invalidateConnection(
    tenantId: string,
    connectionId: string
  ): Promise<void> {
    await this.withTenant(tenantId, async (client) => {
      await client.query(
        "DELETE FROM permalink_records WHERE tenant_id = $1 AND connection_id = $2",
        [tenantId, connectionId]
      );
    });
  }

  private async withTenant<T>(
    tenantId: string,
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantId
      ]);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private toPermalink(row: {
    public_id: string;
    tenant_id: string;
    connection_id: string;
    record_id: string;
  }): PermalinkRecord {
    return {
      publicId: row.public_id,
      tenantId: row.tenant_id,
      connectionId: row.connection_id,
      recordId: row.record_id
    };
  }
}
