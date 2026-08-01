# Security and data handling

## Trust boundaries

The connector has separate credentials for the MCP client and Dext. An OAuth access token identifies the connector user and tenant. A Dext credential authorizes only the upstream provider call. Neither credential belongs in MCP inputs, tool output, record URLs, logs, or audit events.

Local development uses a fixed bearer token and fictional records. Production rejects this authentication mode.

## Tenant isolation

Every service and repository operation receives the tenant from verified authentication context. OAuth claims are mapped to internal tenant and user IDs; requested scopes are intersected with stored membership grants. Stable Dext record IDs do not encode a tenant. Opaque UUID record links are stored with tenant, connection, and record ownership, and the route checks the authenticated tenant again.

Both migrations carry or repair composite tenant ownership, including credentials-to-connections, snapshots-to-connections, snapshot clients-to-snapshots, job attempts-to-jobs, actors-to-memberships, and permalinks-to-connections. Row-level security is enabled and forced on tenant tables. The service uses tenant-scoped transactions that set `app.tenant_id`; the non-owner `dext_connector_app` role cannot bypass those policies. The integration test applies the migrations to an explicitly named loopback test database and proves both cross-tenant foreign-key rejection and RLS visibility.

## Credentials

The schema stores ciphertext, encrypted data key, credential nonce and authentication tag, algorithm version, and key reference. The runtime decrypts a per-connection data key and then the credential with AES-256-GCM; decrypted key material is cleared after use. A managed KMS should wrap the 32-byte base64url master key in hosted deployments. Plain Dext tokens must not be stored in database columns.

The current live Data Health resolver selects an active connection by authenticated tenant, loads only that tenant/connection credential, and constructs the provider for that resolution. A shared limiter is keyed by tenant and connection. There is no process-wide Dext token or cross-tenant fallback.

## Audit and redaction

Audit events include tenant, user, tool, outcome, target IDs, and normalized error code. They exclude arguments, provider bodies, authorization headers, document contents, and stack traces. Provider errors returned to a model are normalized.

Before production, add a structured logger with field-level redaction and a canary test covering logs, traces, metrics, tool results, and audit storage.

## Network policy

The Data Health adapter enforces HTTPS and the exact `api.precision.dext.com` hostname. Only tests may explicitly enable loopback HTTP for a mock server. Production egress should additionally allow only Dext, the selected identity provider, KMS, database, object storage, and telemetry destinations.

## MCP and OAuth surface

Every protected tool publishes a canonical top-level `securitySchemes` declaration and the compatibility mirror under `_meta`. Structured tools declare an `outputSchema`. Authentication failures advertise the protected-resource metadata URL, scope, OAuth error, and description through `WWW-Authenticate` and MCP `mcp/www_authenticate`. The standard `search` and `fetch` tools deliberately retain their exact text-only compatibility shape.

Pagination cursors are authenticated opaque ciphertext bound to tenant, connection, and filter hash. Changing any of those inputs invalidates the cursor instead of allowing it to cross a security boundary.

Commerce production and sandbox need separate credentials and egress destinations. They remain unimplemented until sandbox access is available.

## Write safety

No Dext write or delete tool is registered. Future writes require current-state reads, preview tokens, tenant roles, narrow OAuth scopes, idempotency records, and reconciliation after timeouts. Account deletion and transaction-export deletion also require explicit destructive scope and fresh confirmation.
