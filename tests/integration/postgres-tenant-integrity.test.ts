import { readFile } from "node:fs/promises";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const connectionString = process.env["TEST_DATABASE_URL"];
const enabled = typeof connectionString === "string";
const suite = enabled ? describe : describe.skip;
const { Pool } = pg;

suite("Postgres tenant integrity", () => {
  const pool = new Pool({ connectionString });
  const tenantA = "11111111-1111-4111-8111-111111111111";
  const tenantB = "22222222-2222-4222-8222-222222222222";
  const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const connectionA = "aaaaaaaa-1111-4111-8111-111111111111";
  const connectionB = "bbbbbbbb-2222-4222-8222-222222222222";

  beforeAll(async () => {
    const url = new URL(connectionString!);
    if (
      !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
      !url.pathname.includes("test")
    ) {
      throw new Error(
        "TEST_DATABASE_URL must target a loopback database whose name contains test."
      );
    }
    const migration1 = await readFile("migrations/0001_foundation.sql", "utf8");
    const migration2 = await readFile("migrations/0002_tenant_integrity.sql", "utf8");
    await pool.query(migration1);
    await pool.query(migration2);
    await pool.query(
      `INSERT INTO tenants (id, name) VALUES ($1, 'Tenant A'), ($2, 'Tenant B')`,
      [tenantA, tenantB]
    );
    await pool.query(
      `INSERT INTO users (id, issuer, subject) VALUES ($1, 'https://issuer.test', 'user-a')`,
      [userA]
    );
    await pool.query(
      `INSERT INTO memberships (tenant_id, user_id, role, grants)
       VALUES ($1, $2, 'administrator', ARRAY['connector.read','health.read'])`,
      [tenantA, userA]
    );
    await pool.query(
      `INSERT INTO upstream_connections
        (id, tenant_id, module, environment, label, state)
       VALUES
        ($1, $3, 'data_health', 'sandbox', 'Tenant A', 'active'),
        ($2, $4, 'data_health', 'sandbox', 'Tenant B', 'active')`,
      [connectionA, connectionB, tenantA, tenantB]
    );
  });

  afterAll(async () => pool.end());

  it("rejects a credential that crosses tenant ownership", async () => {
    await expect(
      pool.query(
        `INSERT INTO encrypted_credentials
          (tenant_id, connection_id, ciphertext, encrypted_data_key, nonce,
           auth_tag, algorithm_version, key_reference)
         VALUES ($1, $2, '\\x01', '\\x02', '\\x03', '\\x04',
                 'aes-256-gcm-envelope-v1', 'test-key')`,
        [tenantA, connectionB]
      )
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("limits the non-owner application role to the selected tenant", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE dext_connector_app");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantA
      ]);
      const result = await client.query<{ tenant_id: string }>(
        "SELECT tenant_id FROM upstream_connections ORDER BY tenant_id"
      );
      expect(result.rows).toEqual([{ tenant_id: tenantA }]);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
