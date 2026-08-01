# Provider validation runbook

This runbook is for a dedicated Dext test tenant or Commerce sandbox. Never use a browser session, cookie, password, two-factor code, personal production token, or a company account.

The automated suite does not perform this runbook. It injects synthetic HTTP responses and blocks external network access. A human must authorize and observe any live validation.

## Data Health gate

Prerequisites:

- A Dext-issued token scoped to an isolated test tenant.
- Written approval for live contract testing.
- Synthetic or disposable client records.
- A recorded test window and owner.

For a local-plugin validation, use `scripts/configure-local.ps1` under a dedicated Windows test user or set the local variables through an approved secret launcher:

```text
DEXT_CONNECTOR_MODE=live
DEXT_DATA_HEALTH_ENABLED=true
DEXT_DATA_HEALTH_TOKEN=<isolated test token>
```

For a hosted-service validation, set these flags only in the isolated staging environment:

```text
DEXT_DATA_SOURCE=live
DEXT_LIVE_REQUESTS_ENABLED=true
STORAGE_MODE=postgres
DATABASE_URL=<isolated staging database>
CREDENTIAL_MASTER_KEY=<32-byte base64url key from staging secret manager>
```

For hosted validation, create the isolated tenant, OAuth identity mapping, and membership grants including `connections.write`, `records.read`, and `health.read`. Submit the isolated credential through the authenticated HTTPS connection API; do not hand-write encrypted rows or put a Dext token in the hosted process environment.

Validate in this order:

1. Confirm the service reports live mode without returning the token.
2. Provision the test user's `data_health` connection. Confirm that tool results and any audit, log, trace, or metric output contain no token.
3. Call `GET /clients` once and capture a redacted fixture.
4. Call `GET /clients/{clientId}` for a synthetic client.
5. Call `GET /clients/{clientId}/activity-stats` for that client.
6. Confirm unknown additive fields survive boundary parsing.
7. Confirm 401, 403, 404, 429, invalid JSON, timeout, and 5xx mappings with controlled mocks or a provider test facility.
8. Confirm the per-user, per-connection 60 requests/minute guard.
9. Confirm summary-only risk searches make zero client-detail calls; detail searches stop at the configured budget and continue with an opaque cursor.
10. Run MCP `search`, `fetch`, and direct reads through the selected local or hosted path.
11. Verify canonical and mirrored `noauth` declarations for local stdio, or OAuth declarations and challenges for hosting.
12. Review audit and telemetry output for secrets and unrelated customer data.
13. Disable the local config or disconnect through the hosted connection API, then revoke the isolated credential.

Do not run mutation tests because the Data Health surface is read-only.

## Commerce gate

Use `sandbox-api.greenback.com` only. Provision a Commerce sandbox key through the connection API; validation calls `GET /v2/users/me`. Then prove `types=invoice,bill`, opaque pagination, query/date/account filters, `GET /v2/transactions/{id}`, schema drift, and normalized errors through `list_invoices`, `get_invoice`, `search`, and `fetch`. Only then may `DEXT_COMMERCE_ENABLED=true` be used in staging.

Deletion, export application, transaction writes, account connection, sync challenges, and production access remain separate gates.

## Evidence record

For each live test, record the date, internal tenant/connection identifiers, environment, endpoint contract version, redacted request shape, redacted response fixture, status, rate-limit headers, observed deviations, and reviewer. Never store the bearer value, encryption key, or an authorization header.
