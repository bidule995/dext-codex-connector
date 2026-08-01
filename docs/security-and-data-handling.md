# Security and data handling

## Trust boundaries

The local Codex plugin uses `noauth` between Codex and its stdio child process because both run as the same OS user. A Dext credential authorizes only the upstream provider call. The credential does not belong in MCP inputs, tool output, record URLs, logs, or audit events.

The deferred hosted service has a second credential leg: OAuth identifies the connector user and tenant, then that user's encrypted Dext credential authorizes the upstream call.

## Local credentials

On Windows, the setup helper protects credentials with DPAPI for the current user and stores ciphertext under `%LOCALAPPDATA%\dext-codex-connector`. The plugin reads the plaintext into its Node.js process only while it runs. Environment variables override DPAPI storage for portable setups.

`connection_status` returns only `configured`, `enabled`, `connected`, and `credentialSource` fields. It makes no provider request and does not return a token fingerprint. The plugin bundle contains no PostgreSQL driver, hosted OAuth runtime, credential envelope decryptor, Fastify server, or fixture records.

The local process stores snapshots, audit metadata, and record links in memory. Closing the MCP process removes those records. Plugin uninstall does not remove the DPAPI files because uninstall and credential deletion have different recovery consequences.

## Hosted tenant and user isolation

Every provider, snapshot, and permalink operation receives both tenant and user from verified authentication context. OAuth claims are mapped to internal tenant and user IDs; requested scopes are intersected with stored membership grants. Stable Dext record IDs encode neither principal. Opaque UUID record links are stored against a user-owned connection, and the route checks the authenticated tenant and user again.

The three migrations carry or repair composite tenant ownership and add `owner_user_id` to upstream connections. Row-level security is enabled and forced. Principal-owned operations set both `app.tenant_id` and `app.user_id`; connection, credential, snapshot, snapshot-client, and permalink policies resolve through that user-owned connection. The non-owner `dext_connector_app` role cannot bypass those policies. The integration test applies all migrations to an explicitly named loopback test database and proves cross-tenant foreign-key rejection plus same-tenant, cross-user RLS isolation.

## Hosted credentials

The schema stores ciphertext, encrypted data key, credential nonce and authentication tag, algorithm version, and key reference. The runtime decrypts a per-connection data key and then the credential with AES-256-GCM; decrypted key material is cleared after use. A managed KMS should wrap the 32-byte base64url master key in hosted deployments. Plain Dext tokens must not be stored in database columns.

The live resolvers select an active connection by authenticated tenant, user, and module, load only that connection's credential, and construct the provider for that resolution. Shared limiters are keyed by tenant, user, and connection. There is no process-wide Dext token or cross-principal fallback. Credential submission is available only through the authenticated HTTPS connection API described in `docs/connection-api.md`, never as an MCP tool.

## Audit and redaction

Audit events include tenant, user, tool, outcome, target IDs, and normalized error code. They exclude arguments, provider bodies, authorization headers, document contents, and stack traces. Provider errors returned to a model are normalized.

Before production, add a structured logger with field-level redaction and a canary test covering logs, traces, metrics, tool results, and audit storage.

## Network policy

The Data Health adapter enforces HTTPS and the exact `api.precision.dext.com` hostname. Commerce enforces its selected `sandbox-api.greenback.com` or `api.greenback.com` host. Only tests can enable loopback HTTP for a mock server. Tests also replace global fetch so an accidental external request fails.

## MCP security surface

Local tools publish canonical top-level and mirrored `noauth` declarations. Hosted tools publish OAuth scopes and authentication challenges. Structured tools declare an `outputSchema`; standard `search` and `fetch` retain their text-only compatibility shape.

Pagination cursors are authenticated opaque ciphertext bound to tenant, connection, and filter hash. Changing any of those inputs invalidates the cursor instead of allowing it to cross a security boundary.

Commerce production and sandbox use separate credentials and exact egress destinations. The read adapter is implemented but disabled by default until sandbox evidence is available; all mutation, extraction, connection, synchronization, and export endpoints remain absent from MCP.

## Write safety

No Dext write or delete tool is registered. Future writes require current-state reads, preview tokens, tenant roles, narrow OAuth scopes, idempotency records, and reconciliation after timeouts. Account deletion and transaction-export deletion also require explicit destructive scope and fresh confirmation.
