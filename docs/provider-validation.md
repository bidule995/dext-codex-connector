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

Before starting the service, create the isolated tenant, OAuth identity mapping, and membership grants including `connections.write`, `records.read`, and `health.read`. Submit the isolated credential through the authenticated HTTPS connection API; do not hand-write encrypted rows or put a Dext token in process environment variables.

Validate in this order:

1. Confirm the service reports live mode without returning the token.
2. Provision the test user's `data_health` connection and confirm the response, audit, logs, traces, and metrics contain no token.
3. Call `GET /clients` once and capture a redacted fixture.
4. Call `GET /clients/{clientId}` for a synthetic client.
5. Call `GET /clients/{clientId}/activity-stats` for that client.
6. Confirm unknown additive fields survive boundary parsing.
7. Confirm 401, 403, 404, 429, invalid JSON, timeout, and 5xx mappings with controlled mocks or a provider test facility.
8. Confirm the per-user, per-connection 60 requests/minute guard.
9. Confirm summary-only risk searches make zero client-detail calls; detail searches stop at the configured budget and continue with an opaque cursor.
10. Run MCP `search`, `fetch`, and direct reads through staging OAuth.
11. Verify canonical and mirrored tool security declarations plus complete authentication challenges.
12. Review audit and telemetry output for secrets and unrelated customer data.
13. Disconnect through the connection API, disable the live flags, and revoke the isolated credential.

Do not run mutation tests because the Data Health surface is read-only.

## Commerce gate

Use `sandbox-api.greenback.com` only. Provision a Commerce sandbox key through the connection API; validation calls `GET /v2/users/me`. Then prove `types=invoice,bill`, opaque pagination, query/date/account filters, `GET /v2/transactions/{id}`, schema drift, and normalized errors through `list_invoices`, `get_invoice`, `search`, and `fetch`. Only then may `DEXT_COMMERCE_ENABLED=true` be used in staging.

Deletion, export application, transaction writes, account connection, sync challenges, and production access remain separate gates.

## Evidence record

For each live test, record the date, internal tenant/connection identifiers, environment, endpoint contract version, redacted request shape, redacted response fixture, status, rate-limit headers, observed deviations, and reviewer. Never store the bearer value, encryption key, or an authorization header.
