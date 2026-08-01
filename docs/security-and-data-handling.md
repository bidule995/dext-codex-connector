# Security and data handling

## Trust boundaries

The connector has separate credentials for the MCP client and Dext. An OAuth access token identifies the connector user and tenant. A Dext credential authorizes only the upstream provider call. Neither credential belongs in MCP inputs, tool output, record URLs, logs, or audit events.

Local development uses a fixed bearer token and fictional records. Production rejects this authentication mode.

## Tenant and user isolation

Every provider, snapshot, and permalink operation receives both tenant and user from verified authentication context. OAuth claims are mapped to internal tenant and user IDs; requested scopes are intersected with stored membership grants. Stable Dext record IDs encode neither principal. Opaque UUID record links are stored against a user-owned connection, and the route checks the authenticated tenant and user again.

The three migrations carry or repair composite tenant ownership and add `owner_user_id` to upstream connections. Row-level security is enabled and forced. Principal-owned operations set both `app.tenant_id` and `app.user_id`; connection, credential, snapshot, snapshot-client, and permalink policies resolve through that user-owned connection. The non-owner `dext_connector_app` role cannot bypass those policies. The integration test applies all migrations to an explicitly named loopback test database and proves cross-tenant foreign-key rejection plus same-tenant, cross-user RLS isolation.

## Credentials

The schema stores ciphertext, encrypted data key, credential nonce and authentication tag, algorithm version, and key reference. The runtime decrypts a per-connection data key and then the credential with AES-256-GCM; decrypted key material is cleared after use. A managed KMS should wrap the 32-byte base64url master key in hosted deployments. Plain Dext tokens must not be stored in database columns.

The live resolvers select an active connection by authenticated tenant, user, and module, load only that connection's credential, and construct the provider for that resolution. Shared limiters are keyed by tenant, user, and connection. There is no process-wide Dext token or cross-principal fallback. Credential submission is available only through the authenticated HTTPS connection API described in `docs/connection-api.md`, never as an MCP tool.

## Audit and redaction

Audit events include tenant, user, tool, outcome, target IDs, and normalized error code. They exclude arguments, provider bodies, authorization headers, document contents, and stack traces. Provider errors returned to a model are normalized.

Before production, add a structured logger with field-level redaction and a canary test covering logs, traces, metrics, tool results, and audit storage.

## Network policy

The Data Health adapter enforces HTTPS and the exact `api.precision.dext.com` hostname. Only tests may explicitly enable loopback HTTP for a mock server. Production egress should additionally allow only Dext, the selected identity provider, KMS, database, object storage, and telemetry destinations.

## MCP and OAuth surface

Every protected tool publishes a canonical top-level `securitySchemes` declaration and the compatibility mirror under `_meta`. Structured tools declare an `outputSchema`. Authentication failures advertise the protected-resource metadata URL, scope, OAuth error, and description through `WWW-Authenticate` and MCP `mcp/www_authenticate`. The standard `search` and `fetch` tools deliberately retain their exact text-only compatibility shape.

Pagination cursors are authenticated opaque ciphertext bound to tenant, connection, and filter hash. Changing any of those inputs invalidates the cursor instead of allowing it to cross a security boundary.

Commerce production and sandbox use separate credentials and exact egress destinations. The read adapter is implemented but disabled by default until sandbox evidence is available; all mutation, extraction, connection, synchronization, and export endpoints remain absent from MCP.

## Write safety

No Dext write or delete tool is registered. Future writes require current-state reads, preview tokens, tenant roles, narrow OAuth scopes, idempotency records, and reconciliation after timeouts. Account deletion and transaction-export deletion also require explicit destructive scope and fresh confirmation.
