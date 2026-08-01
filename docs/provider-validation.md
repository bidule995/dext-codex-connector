# Provider validation runbook

This runbook is for a dedicated Dext test tenant or Commerce sandbox. Never use a browser session, cookie, password, two-factor code, personal production token, or a company account.

## Data Health gate

Prerequisites:

- A Dext-issued token scoped to an isolated test tenant.
- Written approval for live contract testing.
- Synthetic or disposable client records.
- A recorded test window and owner.

Set the live flags only in the isolated test environment:

```text
DEXT_DATA_SOURCE=live
DEXT_LIVE_REQUESTS_ENABLED=true
STORAGE_MODE=postgres
DATABASE_URL=<isolated staging database>
CREDENTIAL_MASTER_KEY=<32-byte base64url key from staging secret manager>
```

Before starting the service, create the isolated tenant, OAuth identity mapping, membership grants, one active `data_health` upstream connection, and its AES-GCM envelope-encrypted credential. Do not put a Dext token in process environment variables.

Validate in this order:

1. Confirm the service reports live mode without returning the token.
2. Call `GET /clients` once and capture a redacted fixture.
3. Call `GET /clients/{clientId}` for a synthetic client.
4. Call `GET /clients/{clientId}/activity-stats` for that client.
5. Confirm unknown additive fields survive boundary parsing.
6. Confirm 401, 403, 404, 429, invalid JSON, timeout, and 5xx mappings with controlled mocks or a provider test facility.
7. Confirm the per-tenant, per-connection 60 requests/minute guard.
8. Confirm summary-only risk searches make zero client-detail calls; detail searches stop at the configured budget and continue with an opaque cursor.
9. Run MCP `search`, `fetch`, and direct reads through staging OAuth.
10. Verify canonical and mirrored tool security declarations plus complete authentication challenges.
11. Review audit and telemetry output for secrets and unrelated customer data.
12. Disable the live flags after the test window and revoke the isolated credential.

Do not run mutation tests because the Data Health surface is read-only.

## Commerce gate

Use `sandbox-api.greenback.com` only. Start with `GET /v2/users/me`, then prove pagination and envelope behavior. Enable one tool group at a time after its endpoint paths, response schemas, file limits, idempotency behavior, rate limits, and error semantics pass sandbox tests.

Deletion, export application, transaction writes, account connection, sync challenges, and production access remain separate gates.

## Evidence record

For each live test, record the date, internal tenant/connection identifiers, environment, endpoint contract version, redacted request shape, redacted response fixture, status, rate-limit headers, observed deviations, and reviewer. Never store the bearer value, encryption key, or an authorization header.
