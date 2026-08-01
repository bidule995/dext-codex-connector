# Module release gates

## Data Health

The local beta registers Data Health tools after it finds a dedicated personal API token. The provider limits requests to the documented `api.precision.dext.com` host and 60 requests per minute. Automated tests use injected responses and do not validate a real Dext account.

Before the maintainer calls the local beta production-ready, an authorized user should validate the three documented endpoints against a dedicated Dext test tenant. The current company account remains outside that validation scope.

The hosted source adds user-owned PostgreSQL connections, envelope encryption, an authenticated connection API, and OAuth identity mapping. Hosting remains deferred until an isolated validation tenant, managed secrets, backups, telemetry redaction, and a public OAuth deployment exist.

## Commerce

The repository contains a 33-entry endpoint catalog plus a read-only HTTP provider for `GET /v2/users/me`, `GET /v2/transactions`, and `GET /v2/transactions/{transaction_id}`. A separate Commerce API key adds `list_invoices`, `get_invoice`, and invoice/bill records in `search` and `fetch`. Local and hosted configurations keep Commerce disabled by default.

Before enabling Commerce:

- Obtain Dext Commerce sandbox credentials.
- Confirm the documented envelope and opaque cursor behavior.
- Resolve the singular/plural transaction-path discrepancy in the sandbox.
- Capture redacted schemas for the endpoints used by the first tool group.
- Establish conservative concurrency because public rate limits are not documented.

Extraction remains unimplemented and additionally requires private object storage, malware scanning, file-size and format limits, expiration, and host file-input tests. Account connection and synchronization remain unimplemented and require a secure browser handoff so credentials and two-factor responses never enter MCP data. Writes and exports require preview and idempotency infrastructure. The two deletion contracts require a separate destructive-operation review.

## Prepare

Prepare is disabled. Public Zapier material is not a first-party API contract for a direct connector. Implementation starts only after Dext supplies current partner endpoints, schemas, authentication, limits, and test access.

## MCP Apps UI and distribution

The first release is tool-only. Add UI resources only after tool workflows pass Codex and ChatGPT tests. Public submission is a distinct product decision requiring production hosting, privacy and support material, reviewer access, screenshots, and directory review.
