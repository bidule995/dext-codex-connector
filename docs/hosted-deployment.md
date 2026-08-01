# Hosted connector deployment

The real Codex connector is the repository's Fastify service exposed as a public HTTPS Streamable HTTP MCP endpoint at `/mcp`. The checked-in plugin remains on its fictional stdio runtime until a real host, OAuth client, and isolated Dext credentials pass acceptance; this prevents a placeholder release.

## Required infrastructure

- Public HTTPS origin with stable TLS and streaming support.
- OAuth 2.1 authorization server with protected-resource metadata, authorization-server metadata, PKCE, and a registered or dynamically registered Codex client.
- PostgreSQL 17 using a login role that assumes the non-owner `dext_connector_app` role.
- Secret manager for the 32-byte base64url credential master key, cursor key, database URL, and OAuth configuration.
- Egress allowlists for the OAuth issuer, PostgreSQL/KMS/telemetry, `api.precision.dext.com`, and—only when enabled—the selected Dext Commerce host.
- Structured logs, traces, and metrics with authorization, cookie, request-body, token, and ciphertext redaction.

Apply migrations in order through the migration owner:

```text
migrations/0001_foundation.sql
migrations/0002_tenant_integrity.sql
migrations/0003_user_owned_connections.sql
```

Migration `0003` intentionally refuses to guess ownership for pre-existing upstream connections. Assign and migrate any real rows explicitly before applying it.

## Production configuration

Production fails closed unless all of these are set correctly:

```text
NODE_ENV=production
HOST=0.0.0.0
PUBLIC_BASE_URL=https://<real-host>
STORAGE_MODE=postgres
DATABASE_URL=<secret-manager reference>
DEXT_DATA_SOURCE=live
DEXT_LIVE_REQUESTS_ENABLED=true
DEXT_COMMERCE_ENABLED=false
AUTH_MODE=oauth
AUTH_ISSUER=https://<issuer>
AUTH_AUDIENCE=https://<real-host>/mcp
AUTH_JWKS_URL=https://<issuer>/<jwks-path>
OAUTH_AUTHORIZATION_SERVER=https://<issuer>
CREDENTIAL_MASTER_KEY=<32-byte base64url secret>
CURSOR_ENCRYPTION_KEY=<separate random secret>
```

Leave `DEXT_COMMERCE_ENABLED=false` until the sandbox validation runbook passes. The connection API may still be exercised through mocked validation in CI; no automated test is allowed to contact Dext.

## Rate limiting

The authenticated connection API enforces process-local limits per client address: 60 status reads and 10 connection writes per minute. Deploy an additional distributed limit at the ingress or API gateway so the limit remains effective across replicas. Do not enable forwarded-client-IP trust unless the service is reachable only through a specifically trusted proxy; otherwise clients can forge the address used as the rate-limit key.

## Convert the plugin after deployment

After the hosted `/healthz`, OAuth discovery, `/mcp`, user-owned connection API, and isolated provider tests pass, update the plugin manifest with the real endpoint:

```powershell
pnpm plugin:prepare-hosted -- --url https://<real-host>/mcp
pnpm check:plugin
pnpm release:verify-hosted
pnpm release:verify-hosted -- --network
```

The preparation script rejects localhost, IP literals, `.invalid`, `.example`, credentials, query strings, fragments, non-HTTPS URLs, and paths other than `/mcp`. The network check proves live-mode `/healthz`, protected-resource metadata, and unauthenticated OAuth enforcement without calling Dext. The release workflow repeats it and excludes the fixture runtime from plugin archives.

Do not tag or install the live plugin until Codex can complete OAuth and call `connection_status`, standard `search`/`fetch`, and the enabled direct tools against an isolated test identity. Roll back by removing the remote plugin and reinstalling the last fixture prerelease; do not delete encrypted rows during rollback.
